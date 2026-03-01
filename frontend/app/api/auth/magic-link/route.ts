import { NextRequest, NextResponse } from "next/server"

import { isPlanId } from "@/lib/plans"
import { getSupabaseEnv } from "@/lib/server/env"
import { AppError, badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { validateEmail } from "@/lib/server/validation"

type MagicLinkBody = {
  email?: unknown
  plan?: unknown
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`auth:magic-link:${ip}`, 10, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests("Too many attempts. Please wait before requesting another magic link.")
    }

    const body = await parseJsonBody<MagicLinkBody>(request)
    const email = validateEmail(body.email)

    let plan: string | null = null
    if (typeof body.plan === "string") {
      if (!isPlanId(body.plan)) {
        throw badRequest("Invalid plan selection.")
      }
      plan = body.plan
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
    const callbackUrl = `${appUrl()}/auth/callback${plan ? `?plan=${encodeURIComponent(plan)}` : ""}`

    const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        create_user: true,
        email_redirect_to: callbackUrl,
      }),
      cache: "no-store",
    })

    const payload = (await response.json().catch(() => null)) as { message?: string; error_description?: string } | null
    if (!response.ok) {
      throw new AppError(
        400,
        "Unable to send magic link.",
        payload?.error_description ?? `Supabase OTP error (${response.status})`,
      )
    }

    return NextResponse.json({
      ok: true,
      message: payload?.message ?? "Magic link sent. Check your inbox and spam folder.",
    })
  } catch (error) {
    return toErrorResponse("api/auth/magic-link", error, "Unable to send magic link.")
  }
}
