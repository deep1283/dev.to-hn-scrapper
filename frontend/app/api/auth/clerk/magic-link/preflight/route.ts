import { createHash } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { AppError, tooManyRequests, toErrorResponse } from "@/lib/server/errors"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { validateEmail } from "@/lib/server/validation"

type MagicLinkPreflightBody = {
  email?: unknown
}

function ensureClerkConfigured() {
  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new AppError(503, "Authentication service is not configured.")
  }
}

function emailHash(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 24)
}

export async function POST(request: NextRequest) {
  try {
    ensureClerkConfigured()

    const ip = getRequestIp(request)
    const ipLimit = await takeRateLimit(`auth:clerk:magic-link:ip:${ip}`, 20, 60_000)
    if (!ipLimit.allowed) {
      throw tooManyRequests("Too many sign-in attempts. Please wait and try again.")
    }

    const body = await parseJsonBody<MagicLinkPreflightBody>(request)
    const email = validateEmail(body.email)

    const hashedEmail = emailHash(email)
    const emailLimit = await takeRateLimit(`auth:clerk:magic-link:email:${hashedEmail}`, 8, 10 * 60_000)
    if (!emailLimit.allowed) {
      throw tooManyRequests("Too many attempts for this email. Please try again in a few minutes.")
    }

    return NextResponse.json({ ok: true, email })
  } catch (error) {
    return toErrorResponse("api/auth/clerk/magic-link/preflight", error, "Unable to continue right now.")
  }
}
