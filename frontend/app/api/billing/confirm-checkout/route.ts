import { NextRequest, NextResponse } from "next/server"

import { requireAuth } from "@/lib/server/authz"
import { AppError, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"

/**
 * Called after a Dodo checkout when the user returns to the app.
 * Verifies with the Dodo API that the user actually has an active
 * subscription before flipping billing_mode → 'paid'.
 */

type DodoSubscription = {
  subscription_id?: string
  status?: string
  customer?: { customer_id?: string; email?: string }
  metadata?: Record<string, unknown>
}

function getServiceEnv() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dodoApiKey = process.env.DODO_PAYMENTS_API_KEY
  const mode = (process.env.DODO_PAYMENTS_MODE ?? "live").toLowerCase()
  const dodoBaseUrl = (
    process.env.DODO_API_BASE_URL ??
    (mode === "test" ? "https://test.dodopayments.com" : "https://live.dodopayments.com")
  ).replace(/\/+$/, "")

  if (!supabaseUrl || !serviceRoleKey) {
    throw new AppError(500, "Billing confirmation is not configured.")
  }
  if (!dodoApiKey) {
    throw new AppError(500, "Payment verification is not configured.")
  }

  return { supabaseUrl, serviceRoleKey, dodoApiKey, dodoBaseUrl }
}

function headersForServiceRole(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  }
}

/**
 * Verify with Dodo that the user actually has an active subscription.
 * Checks subscriptions list for ones matching this user's email or ID.
 */
async function verifyDodoPayment(
  dodoBaseUrl: string,
  dodoApiKey: string,
  userEmail: string | undefined,
): Promise<boolean> {
  if (!userEmail) {
    return false
  }

  try {
    // List subscriptions and check for active ones matching the user's email
    const response = await fetch(`${dodoBaseUrl}/subscriptions`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${dodoApiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      // If Dodo API fails, deny the upgrade for safety
      return false
    }

    const subscriptions = (await response.json().catch(() => [])) as DodoSubscription[]
    const normalizedEmail = userEmail.trim().toLowerCase()

    // Check if any subscription matches this user and is active
    return subscriptions.some((sub) => {
      const subEmail = sub.customer?.email?.trim().toLowerCase()
      const isActive = sub.status === "active" || sub.status === "on_trial"
      return isActive && subEmail === normalizedEmail
    })
  } catch {
    // If verification fails, deny the upgrade for safety
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`billing:confirm:${auth.userId}:${ip}`, 10, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests()
    }

    const { supabaseUrl, serviceRoleKey, dodoApiKey, dodoBaseUrl } = getServiceEnv()

    // Fetch current profile
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?clerk_user_id=eq.${encodeURIComponent(auth.userId)}&select=id,email,billing_mode,plan_selected_at,trial_ends_at&limit=1`,
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
      email: string | null
      billing_mode: string | null
      plan_selected_at: string | null
      trial_ends_at: string | null
    }

    const profiles = (await profileRes.json().catch(() => [])) as ProfileRow[]
    const profile = profiles[0]
    if (!profile) {
      return NextResponse.json({ ok: true, status: "no_profile" })
    }

    // Already paid — nothing to do
    if (profile.billing_mode === "paid") {
      return NextResponse.json({ ok: true, status: "already_paid" })
    }

    // Verify with Dodo that a real payment/subscription exists
    const userEmail = profile.email ?? auth.email
    const hasValidPayment = await verifyDodoPayment(dodoBaseUrl, dodoApiKey, userEmail)
    if (!hasValidPayment) {
      return NextResponse.json({ ok: false, status: "no_payment_found" }, { status: 402 })
    }

    // Payment verified — update to paid
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
