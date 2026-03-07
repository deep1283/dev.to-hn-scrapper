import { NextRequest } from "next/server"

import { sendWelcomeEmailIfEligible } from "@/lib/server/email"
import { ensureProfile, signInWithPassword, signUpWithPassword } from "@/lib/server/supabase"
import { tooManyRequests, toErrorResponse } from "@/lib/server/errors"
import { createSessionResponse } from "@/lib/server/session"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { isTrialExpired, validateEmail, validatePassword } from "@/lib/server/validation"

type AuthMode = "signin" | "signup"

type LoginBody = {
  mode?: AuthMode
  email?: string
  password?: string
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`auth:login:${ip}`, 10, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<LoginBody>(request)
    const mode: AuthMode = body.mode === "signup" ? "signup" : "signin"
    const email = validateEmail(body.email)
    const password = validatePassword(body.password)

    const session = mode === "signup" ? await signUpWithPassword(email, password) : await signInWithPassword(email, password)
    const profile = await ensureProfile(session.accessToken, session.user.id, session.user.email)
    await sendWelcomeEmailIfEligible(profile).catch((error) => {
      console.warn("[email] Unable to send welcome email after password auth.", error)
    })

    const nextRoute = !profile.plan_selected_at
      ? "/pricing"
      : isTrialExpired(profile)
        ? "/upgrade"
        : !profile.onboarding_completed
          ? "/onboarding"
          : "/dashboard"

    return createSessionResponse(
      {
        user: session.user,
        profile,
        nextRoute,
      },
      session,
    )
  } catch (error) {
    return toErrorResponse("api/auth/login", error, "Unable to sign in right now.")
  }
}
