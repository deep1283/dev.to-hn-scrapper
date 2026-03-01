import { NextRequest, NextResponse } from "next/server"

import { isPlanId } from "@/lib/plans"
import { getSupabaseEnv } from "@/lib/server/env"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
}

export async function GET(request: NextRequest) {
  try {
    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`auth:oauth:google:${ip}`, 30, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests("Too many sign-in attempts. Please try again shortly.")
    }

    const rawPlan = request.nextUrl.searchParams.get("plan")
    const plan = rawPlan && isPlanId(rawPlan) ? rawPlan : null
    if (rawPlan && !plan) {
      throw badRequest("Invalid plan selection.")
    }

    const redirectTo = `${appUrl()}/auth/callback${plan ? `?plan=${encodeURIComponent(plan)}` : ""}`
    const { supabaseUrl } = getSupabaseEnv()

    const destination = new URL(`${supabaseUrl}/auth/v1/authorize`)
    destination.searchParams.set("provider", "google")
    destination.searchParams.set("redirect_to", redirectTo)

    return NextResponse.redirect(destination)
  } catch (error) {
    return toErrorResponse("api/auth/oauth/google", error, "Unable to start Google sign-in.")
  }
}
