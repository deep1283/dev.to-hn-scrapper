import { NextRequest, NextResponse } from "next/server"

import { AppError, tooManyRequests, toErrorResponse } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"

function ensureClerkConfigured() {
  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new AppError(503, "Authentication service is not configured.")
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureClerkConfigured()

    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`auth:clerk:oauth:google:${ip}`, 30, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests("Too many Google sign-in attempts. Please try again shortly.")
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse("api/auth/clerk/oauth/google/preflight", error, "Unable to continue right now.")
  }
}
