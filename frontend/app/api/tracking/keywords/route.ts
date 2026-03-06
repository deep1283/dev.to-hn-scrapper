import { NextRequest, NextResponse } from "next/server"

import { PLAN_CONFIG } from "@/lib/plans"
import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { bootstrapMentionsAfterKeywordActivation } from "@/lib/server/mentions-bootstrap"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { insertKeyword, listKeywords, updateKeyword } from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"
import { normalizeInput } from "@/lib/server/validation"

type CreateKeywordBody = {
  query?: string
  deferBootstrap?: boolean
}

type UpdateKeywordBody = {
  id?: string
  query?: string
  isActive?: boolean
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const profileId = auth.profile.id
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true"
    const keywords = await listKeywords(auth.accessToken, profileId, includeInactive)
    const response = NextResponse.json({ keywords })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/tracking/keywords:get", error, "Unable to load keywords.")
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const profileId = auth.profile.id
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`tracking:keywords:create:${profileId}:${ip}`, 30, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<CreateKeywordBody>(request)
    const query = normalizeInput(body.query ?? "")
    const deferBootstrap = body.deferBootstrap === true
    if (query.length < 2 || query.length > 120) {
      throw badRequest("Keyword must be between 2 and 120 characters.")
    }

    const existingKeywords = await listKeywords(auth.accessToken, profileId, true)
    const existing = existingKeywords.find((keyword) => keyword.query.toLowerCase() === query.toLowerCase())
    if (existing?.is_active) {
      const response = NextResponse.json({ keyword: existing })
      return withSessionCookie(response, auth.sessionResult)
    }

    const activeCount = existingKeywords.filter((keyword) => keyword.is_active).length
    const plan = PLAN_CONFIG[auth.profile.plan_tier]
    if (activeCount >= plan.maxKeywords) {
      throw badRequest(`Your ${plan.name} plan supports up to ${plan.maxKeywords} keywords.`)
    }

    const wasReactivated = Boolean(existing && !existing.is_active)
    const keyword = existing
      ? await updateKeyword(auth.accessToken, profileId, existing.id, { is_active: true, query })
      : await insertKeyword(auth.accessToken, profileId, query)

    if (!deferBootstrap && (wasReactivated || !existing)) {
      await bootstrapMentionsAfterKeywordActivation({
        accessToken: auth.accessToken,
        userId: profileId,
      })
    }

    const response = NextResponse.json({ keyword })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/tracking/keywords:post", error, "Unable to add keyword.")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const profileId = auth.profile.id
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`tracking:keywords:update:${profileId}:${ip}`, 40, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<UpdateKeywordBody>(request)
    if (typeof body.id !== "string" || !body.id) {
      throw badRequest("Keyword id is required.")
    }

    const patch: { is_active?: boolean; query?: string } = {}
    if (typeof body.isActive === "boolean") {
      patch.is_active = body.isActive
    }
    if (typeof body.query === "string") {
      const normalized = normalizeInput(body.query)
      if (normalized.length < 2 || normalized.length > 120) {
        throw badRequest("Keyword must be between 2 and 120 characters.")
      }
      patch.query = normalized
    }
    if (!Object.keys(patch).length) {
      throw badRequest("No valid keyword changes provided.")
    }

    let wasReactivated = false

    if (patch.is_active) {
      const existingKeywords = await listKeywords(auth.accessToken, profileId, true)
      const activeCount = existingKeywords.filter((keyword) => keyword.is_active && keyword.id !== body.id).length
      const plan = PLAN_CONFIG[auth.profile.plan_tier]
      if (activeCount >= plan.maxKeywords) {
        throw badRequest(`Your ${plan.name} plan supports up to ${plan.maxKeywords} keywords.`)
      }
      const current = existingKeywords.find((keyword) => keyword.id === body.id)
      wasReactivated = Boolean(current && !current.is_active)
    }

    const keyword = await updateKeyword(auth.accessToken, profileId, body.id, patch)

    if (wasReactivated) {
      await bootstrapMentionsAfterKeywordActivation({
        accessToken: auth.accessToken,
        userId: profileId,
      })
    }

    const response = NextResponse.json({ keyword })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/tracking/keywords:patch", error, "Unable to update keyword.")
  }
}
