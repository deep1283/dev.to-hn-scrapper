import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { toErrorResponse } from "@/lib/server/errors"
import { listBrands, listKeywords } from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const [brands, keywords] = await Promise.all([
      listBrands(auth.accessToken, auth.userId, false),
      listKeywords(auth.accessToken, auth.userId, false, false),
    ])

    const nextRoute = !auth.profile.onboarding_completed ? "/onboarding" : "/dashboard"

    const response = NextResponse.json({
      user: auth.user,
      profile: auth.profile,
      brands,
      keywords,
      nextRoute,
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/dashboard/bootstrap", error, "Unable to load dashboard.")
  }
}
