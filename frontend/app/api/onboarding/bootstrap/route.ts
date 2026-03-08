import { NextRequest, NextResponse } from "next/server"

import { requireAuth } from "@/lib/server/authz"
import { toErrorResponse } from "@/lib/server/errors"
import { ensureProfile, listKeywords } from "@/lib/server/supabase"
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
        : profile.onboarding_completed
          ? "/dashboard"
          : "/onboarding"

    const keywords =
      nextRoute === "/onboarding"
        ? await listKeywords(auth.accessToken, profile.id, false)
        : []

    const response = NextResponse.json({
      user: auth.user,
      profile,
      keywords,
      nextRoute,
    })

    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/onboarding/bootstrap", error, "Unable to load onboarding.")
  }
}
