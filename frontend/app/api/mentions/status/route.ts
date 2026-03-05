import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { restRequest } from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"

export const dynamic = "force-dynamic"
const HISTORY_DAYS = 7
const STATUS_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const

type MentionStatusRow = {
  matched_at: string | null
}

function parseSince(value: string | null): string | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest("Invalid since value.")
  }
  return parsed.toISOString()
}

function latestMatchedAt(rows: MentionStatusRow[]): string | null {
  const raw = rows.find((row) => typeof row.matched_at === "string" && row.matched_at.trim())?.matched_at ?? null
  if (!raw) {
    return null
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`mentions:status:${auth.userId}:${ip}`, STATUS_RATE_LIMIT.limit, STATUS_RATE_LIMIT.windowMs)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const since = parseSince(request.nextUrl.searchParams.get("since"))
    const cutoff = new Date()
    cutoff.setUTCHours(0, 0, 0, 0)
    cutoff.setUTCDate(cutoff.getUTCDate() - HISTORY_DAYS)

    const rows = await restRequest<MentionStatusRow[]>(
      `/mention_matches?user_id=eq.${encodeURIComponent(
        auth.userId,
      )}&select=matched_at,mentions!inner(published_at)&mentions.published_at=gte.${encodeURIComponent(cutoff.toISOString())}&order=matched_at.desc&limit=1`,
      auth.accessToken,
    )

    const latest = latestMatchedAt(rows)
    const hasNew = Boolean(latest && (!since || latest > since))

    const response = NextResponse.json({
      hasNew,
      latestMatchedAt: latest,
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/mentions/status:get", error, "Unable to check mention status right now.")
  }
}
