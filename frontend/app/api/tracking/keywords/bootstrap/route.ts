import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { bootstrapMentionsAfterKeywordActivation } from "@/lib/server/mentions-bootstrap"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { withSessionCookie } from "@/lib/server/session"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`tracking:keywords:bootstrap:${auth.profile.id}:${ip}`, 10, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    await bootstrapMentionsAfterKeywordActivation({
      accessToken: auth.accessToken,
      userId: auth.profile.id,
    })

    const response = NextResponse.json({ ok: true })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/tracking/keywords/bootstrap", error, "Unable to refresh keyword mentions.")
  }
}
