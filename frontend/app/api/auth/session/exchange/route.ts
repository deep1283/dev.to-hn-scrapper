import { NextRequest } from "next/server"

import { sendWelcomeEmailIfEligible } from "@/lib/server/email"
import { getSupabaseEnv } from "@/lib/server/env"
import { ensureProfile, getAuthUser, type ServerSession } from "@/lib/server/supabase"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { createSessionResponse } from "@/lib/server/session"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { isTrialExpired } from "@/lib/server/validation"

type ExchangeBody = {
  accessToken?: unknown
  refreshToken?: unknown
  expiresIn?: unknown
  tokenHash?: unknown
  type?: unknown
}

type VerifyResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

async function verifyOtp(tokenHash: string, type: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const normalizedType = type.toLowerCase()
  if (normalizedType !== "magiclink" && normalizedType !== "email") {
    throw badRequest("Unsupported auth callback type.")
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  const response = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: normalizedType,
      token_hash: tokenHash,
    }),
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as VerifyResponse | null
  if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
    throw badRequest("This sign-in link is invalid or expired.")
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn:
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) && payload.expires_in > 0
        ? Math.floor(payload.expires_in)
        : 3600,
  }
}

function toSession(body: ExchangeBody, user: { id: string; email?: string }): ServerSession {
  if (typeof body.accessToken !== "string" || !body.accessToken) {
    throw badRequest("Missing access token.")
  }
  if (typeof body.refreshToken !== "string" || !body.refreshToken) {
    throw badRequest("Missing refresh token.")
  }

  const expiresIn =
    typeof body.expiresIn === "number" && Number.isFinite(body.expiresIn) && body.expiresIn > 0
      ? Math.floor(body.expiresIn)
      : 3600

  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    user,
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`auth:session:exchange:${ip}`, 30, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<ExchangeBody>(request)
    let accessToken = typeof body.accessToken === "string" ? body.accessToken : ""
    let refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : ""
    let expiresIn =
      typeof body.expiresIn === "number" && Number.isFinite(body.expiresIn) && body.expiresIn > 0
        ? Math.floor(body.expiresIn)
        : 3600

    if (!accessToken) {
      const tokenHash = typeof body.tokenHash === "string" ? body.tokenHash : ""
      const type = typeof body.type === "string" ? body.type : ""
      if (!tokenHash || !type) {
        throw badRequest("Missing access token.")
      }
      const verified = await verifyOtp(tokenHash, type)
      accessToken = verified.accessToken
      refreshToken = verified.refreshToken
      expiresIn = verified.expiresIn
    }

    const user = await getAuthUser(accessToken)
    const profile = await ensureProfile(accessToken, user.id, user.email)
    await sendWelcomeEmailIfEligible(profile).catch((error) => {
      console.warn("[email] Unable to send welcome email after session exchange.", error)
    })
    const session = toSession(
      {
        accessToken,
        refreshToken,
        expiresIn,
      },
      user,
    )

    const nextRoute = !profile.plan_selected_at
      ? "/pricing"
      : isTrialExpired(profile)
        ? "/upgrade"
        : !profile.onboarding_completed
          ? "/onboarding"
          : "/dashboard"

    return createSessionResponse(
      {
        user,
        profile,
        nextRoute,
      },
      session,
    )
  } catch (error) {
    return toErrorResponse("api/auth/session/exchange", error, "Unable to finish sign-in.")
  }
}
