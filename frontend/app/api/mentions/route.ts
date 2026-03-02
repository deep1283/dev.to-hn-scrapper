import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { ACTIVE_PLATFORMS, isActivePlatform, type ActivePlatform } from "@/lib/platforms"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { restRequest } from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"

export const dynamic = "force-dynamic"

type Mention = {
  platform: ActivePlatform
  externalId: string
  url: string
  title: string
  excerpt: string
  author: string | null
  community: string | null
  publishedAt: string
  matchedTerms: string[]
}

type MentionBody = {
  platforms?: unknown
  limit?: number
}

type MentionMatchRow = {
  matched_query: string
  mentions: {
    platform: ActivePlatform
    external_id: string
    url: string
    title: string | null
    body_excerpt: string | null
    author: string | null
    community: string | null
    published_at: string
  } | null
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function parsePlatforms(value: unknown, maxItems = 10): ActivePlatform[] {
  if (value === undefined) {
    return [...ACTIVE_PLATFORMS]
  }
  if (!Array.isArray(value)) {
    throw badRequest("Invalid platform filter.")
  }

  const seen = new Set<string>()
  const output: ActivePlatform[] = []
  for (const item of value) {
    if (typeof item !== "string" || !isActivePlatform(item)) {
      throw badRequest("Invalid platform filter.")
    }
    if (seen.has(item)) {
      continue
    }
    seen.add(item)
    output.push(item)
    if (output.length >= maxItems) {
      break
    }
  }

  if (!output.length) {
    throw badRequest("Enable at least one platform.")
  }
  return output
}

function toIso(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString()
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function limitMentionsPerPlatform(mentions: Mention[], platforms: ActivePlatform[], perPlatformLimit: number): Mention[] {
  const byPlatform = new Map<ActivePlatform, Mention[]>()
  for (const platform of platforms) {
    byPlatform.set(platform, [])
  }

  for (const mention of mentions) {
    const bucket = byPlatform.get(mention.platform)
    if (bucket) {
      bucket.push(mention)
    }
  }

  const selected: Mention[] = []
  for (const platform of platforms) {
    const bucket = byPlatform.get(platform) ?? []
    selected.push(...bucket.slice(0, perPlatformLimit))
  }

  selected.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  return selected
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`mentions:read:${auth.userId}:${ip}`, 45, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<MentionBody>(request)
    const platforms = parsePlatforms(body.platforms, 10)

    const perPlatformLimit = Math.min(Math.max(Number(body.limit ?? 100), 10), 300)
    const platformFilter = `&mentions.platform=in.(${platforms.join(",")})`
    const rowLimit = Math.min(perPlatformLimit * Math.max(platforms.length, 1) * 6, 3600)

    const rows = await restRequest<MentionMatchRow[]>(
      `/mention_matches?user_id=eq.${encodeURIComponent(
        auth.userId,
      )}&select=matched_query,mentions!inner(platform,external_id,url,title,body_excerpt,author,community,published_at)${platformFilter}&order=matched_at.desc&limit=${Math.min(
        rowLimit,
        3600,
      )}`,
      auth.accessToken,
    )

    const merged = new Map<string, Mention>()
    for (const row of rows) {
      const mentionRow = row.mentions
      if (!mentionRow) {
        continue
      }
      const key = `${mentionRow.platform}:${mentionRow.external_id}`
      const term = normalizeText(String(row.matched_query ?? ""))

      const existing = merged.get(key)
      if (!existing) {
        merged.set(key, {
          platform: mentionRow.platform,
          externalId: mentionRow.external_id,
          url: mentionRow.url,
          title: normalizeText(mentionRow.title ?? "") || "Mention",
          excerpt: normalizeText(mentionRow.body_excerpt ?? "").slice(0, 450),
          author: mentionRow.author,
          community: mentionRow.community,
          publishedAt: toIso(mentionRow.published_at),
          matchedTerms: term ? [term] : [],
        })
        continue
      }

      if (term && !existing.matchedTerms.includes(term)) {
        existing.matchedTerms.push(term)
      }
    }

    const mentions = Array.from(merged.values())
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    const independentMentions = limitMentionsPerPlatform(mentions, platforms, perPlatformLimit)

    const response = NextResponse.json({
      fetchedAt: new Date().toISOString(),
      sourceErrors: [],
      mentions: independentMentions,
    })

    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/mentions", error, "Unable to fetch mentions right now.")
  }
}
