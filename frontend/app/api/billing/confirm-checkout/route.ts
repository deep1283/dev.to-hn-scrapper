import { NextRequest, NextResponse } from "next/server"

import { requireAuth } from "@/lib/server/authz"
import { toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"

/**
 * Called after a Dodo checkout when the user returns to the app.
 * Directly flips billing_mode → 'paid' so the user isn't stuck on /upgrade
 * while waiting for the webhook to arrive.
 *
 * Safety: this only promotes the user to 'paid'; it never downgrades.
 */
function getServiceEnv() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Billing confirmation is not configured.")
  }

  return { supabaseUrl, serviceRoleKey }
}

function headersForServiceRole(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`billing:confirm:${auth.userId}:${ip}`, 20, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests()
    }

    const { supabaseUrl, serviceRoleKey } = getServiceEnv()

    // Fetch current profile
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?clerk_user_id=eq.${encodeURIComponent(auth.userId)}&select=id,billing_mode,plan_selected_at,trial_ends_at&limit=1`,
      {
        method: "GET",
        headers: headersForServiceRole(serviceRoleKey),
        cache: "no-store",
      },
    )

    if (!profileRes.ok) {
      throw new Error(`Profile fetch failed (${profileRes.status})`)
    }

    type ProfileRow = {
      id: string
      billing_mode: string | null
      plan_selected_at: string | null
      trial_ends_at: string | null
    }

    const profiles = (await profileRes.json().catch(() => [])) as ProfileRow[]
    const profile = profiles[0]
    if (!profile) {
      return NextResponse.json({ ok: true, status: "no_profile" })
    }

    // Only upgrade trial → paid; never downgrade
    if (profile.billing_mode === "paid") {
      return NextResponse.json({ ok: true, status: "already_paid" })
    }

    // Update to paid
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,
      {
        method: "PATCH",
        headers: {
          ...headersForServiceRole(serviceRoleKey),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          billing_mode: "paid",
          trial_started_at: null,
          trial_ends_at: null,
        }),
        cache: "no-store",
      },
    )

    if (!patchRes.ok) {
      throw new Error(`Profile update failed (${patchRes.status})`)
    }

    return NextResponse.json({ ok: true, status: "upgraded" })
  } catch (error) {
    return toErrorResponse("api/billing/confirm-checkout", error, "Unable to confirm checkout.")
  }
}
