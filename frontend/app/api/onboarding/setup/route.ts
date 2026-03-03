import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { bootstrapMentionsAfterOnboarding } from "@/lib/server/mentions-bootstrap"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import {
  listBrands,
  listKeywords,
  patchProfile,
  insertKeyword,
  updateBrand,
  updateKeyword,
} from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"
import { assertPlanCounts, sanitizeStringList } from "@/lib/server/validation"

type OnboardingBody = {
  terms?: string[]
  brands?: string[]
  keywords?: string[]
}

function mergeTerms(...groups: string[][]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const group of groups) {
    for (const item of group) {
      const key = item.toLowerCase()
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      merged.push(item)
    }
  }
  return merged
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`onboarding:setup:${auth.userId}:${ip}`, 20, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<OnboardingBody>(request)
    const terms = sanitizeStringList(body.terms, 80, 120)
    const brands = sanitizeStringList(body.brands, 40, 80)
    const keywords = sanitizeStringList(body.keywords, 80, 120)
    const unifiedTerms = mergeTerms(terms, keywords, brands)

    if (!unifiedTerms.length) {
      throw badRequest("Add at least one keyword or brand term.")
    }

    const profile = auth.profile
    const shouldBootstrapMentions = !profile.onboarding_completed

    assertPlanCounts(profile.plan_tier, unifiedTerms)

    const existingBrands = await listBrands(auth.accessToken, auth.userId, true)
    const existingKeywords = await listKeywords(auth.accessToken, auth.userId, true, false)
    const keywordByLower = new Map(existingKeywords.map((keyword) => [keyword.query.toLowerCase(), keyword]))

    for (const existing of existingBrands) {
      if (!existing.is_active) {
        continue
      }
      await updateBrand(auth.accessToken, auth.userId, existing.id, {
        is_active: false,
      })
    }

    for (const keyword of unifiedTerms) {
      const existing = keywordByLower.get(keyword.toLowerCase())
      if (!existing) {
        await insertKeyword(auth.accessToken, auth.userId, keyword)
        continue
      }

      if (!existing.is_active || existing.query !== keyword) {
        await updateKeyword(auth.accessToken, auth.userId, existing.id, {
          is_active: true,
          query: keyword,
        })
      }
    }

    for (const existing of existingKeywords) {
      if (!existing.is_active) {
        continue
      }
      if (!unifiedTerms.some((item) => item.toLowerCase() === existing.query.toLowerCase())) {
        await updateKeyword(auth.accessToken, auth.userId, existing.id, {
          is_active: false,
        })
      }
    }

    const updatedProfile = await patchProfile(auth.accessToken, auth.userId, { onboarding_completed: true })
    if (shouldBootstrapMentions && updatedProfile.onboarding_completed) {
      await bootstrapMentionsAfterOnboarding({
        accessToken: auth.accessToken,
        userId: auth.userId,
        termCount: unifiedTerms.length,
      })
    }

    const response = NextResponse.json({
      ok: true,
      nextRoute: "/dashboard",
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/onboarding/setup", error, "Unable to save onboarding.")
  }
}
