import { NextRequest, NextResponse } from "next/server"

import { ensureProfile } from "@/lib/server/supabase"
import { toErrorResponse } from "@/lib/server/errors"
import { requireAuth } from "@/lib/server/authz"
import { withSessionCookie } from "@/lib/server/session"
import { isTrialExpired } from "@/lib/server/validation"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const profile = await ensureProfile(auth.accessToken, auth.userId, auth.email)
    const nextRoute = !profile.plan_selected_at
      ? "/pricing"
      : isTrialExpired(profile)
        ? "/upgrade"
        : !profile.onboarding_completed
          ? "/onboarding"
          : "/dashboard"

    const response = NextResponse.json({
      user: auth.user,
      profile,
      nextRoute,
    })

    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/auth/session", error, "Session not found.")
  }
}
