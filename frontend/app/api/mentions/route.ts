import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { ACTIVE_PLATFORMS, isActivePlatform, type ActivePlatform } from "@/lib/platforms"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { restRequest } from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"

export const dynamic = "force-dynamic"
const HISTORY_DAYS = 7
const MAX_PER_PLATFORM_LIMIT = 100
const RATE_LIMITS = {
  burstPerUserIp: { limit: 8, windowMs: 10_000 },
  perUserMinute: { limit: 30, windowMs: 60_000 },
  perIpMinute: { limit: 90, windowMs: 60_000 },
} as const

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
  matched_at: string | null
  keywords: {
    is_active: boolean
  } | null
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

function latestMatchedIso(rows: MentionMatchRow[]): string | null {
  let latest: Date | null = null
  for (const row of rows) {
    if (!row.matched_at) {
      continue
    }
    const parsed = new Date(row.matched_at)
    if (Number.isNaN(parsed.getTime())) {
      continue
    }
    if (!latest || parsed > latest) {
      latest = parsed
    }
  }
  return latest ? latest.toISOString() : null
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

function normalizedTermKey(value: string): string {
  return normalizeText(value).toLowerCase()
}

function fairSelectMentionsForPlatform(mentions: Mention[], limit: number): Mention[] {
  if (mentions.length <= limit) {
    return mentions
  }

  const keywordCandidates = new Map<string, number[]>()
  const keywordCoverage = new Map<string, number>()

  mentions.forEach((mention, index) => {
    for (const term of mention.matchedTerms) {
      const key = normalizedTermKey(term)
      if (!key) {
        continue
      }
      const candidates = keywordCandidates.get(key)
      if (candidates) {
        candidates.push(index)
      } else {
        keywordCandidates.set(key, [index])
      }
      if (!keywordCoverage.has(key)) {
        keywordCoverage.set(key, 0)
      }
    }
  })

  if (!keywordCandidates.size) {
    return mentions.slice(0, limit)
  }

  const selectedIndexes = new Set<number>()
  const selected: Mention[] = []
  const candidatePointers = new Map<string, number>()

  while (selected.length < limit) {
    let chosenKeyword: string | null = null
    let chosenIndex = -1
    let chosenCoverage = Number.POSITIVE_INFINITY
    let chosenPublishedAt = Number.NEGATIVE_INFINITY

    for (const [keyword, candidateIndexes] of keywordCandidates.entries()) {
      let pointer = candidatePointers.get(keyword) ?? 0
      while (pointer < candidateIndexes.length && selectedIndexes.has(candidateIndexes[pointer])) {
        pointer += 1
      }
      candidatePointers.set(keyword, pointer)

      if (pointer >= candidateIndexes.length) {
        continue
      }

      const mentionIndex = candidateIndexes[pointer]
      const coverage = keywordCoverage.get(keyword) ?? 0
      const publishedAt = new Date(mentions[mentionIndex].publishedAt).getTime()

      const isBetterChoice =
        coverage < chosenCoverage ||
        (coverage === chosenCoverage && publishedAt > chosenPublishedAt) ||
        (coverage === chosenCoverage && publishedAt === chosenPublishedAt && keyword < (chosenKeyword ?? ""))

      if (isBetterChoice) {
        chosenKeyword = keyword
        chosenIndex = mentionIndex
        chosenCoverage = coverage
        chosenPublishedAt = publishedAt
      }
    }

    if (chosenKeyword === null || chosenIndex < 0) {
      break
    }

    selectedIndexes.add(chosenIndex)
    const mention = mentions[chosenIndex]
    selected.push(mention)

    for (const term of mention.matchedTerms) {
      const key = normalizedTermKey(term)
      if (!key || !keywordCoverage.has(key)) {
        continue
      }
      keywordCoverage.set(key, (keywordCoverage.get(key) ?? 0) + 1)
    }
  }

  if (selected.length < limit) {
    for (const [mentionIndex, mention] of mentions.entries()) {
      if (selectedIndexes.has(mentionIndex)) {
        continue
      }
      selected.push(mention)
      if (selected.length >= limit) {
        break
      }
    }
  }

  return selected
}

function fairLimitMentionsPerPlatform(mentions: Mention[], platforms: ActivePlatform[], perPlatformLimit: number): Mention[] {
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
    selected.push(...fairSelectMentionsForPlatform(bucket, perPlatformLimit))
  }

  selected.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  return selected
}

async function enforceMentionsRateLimits(userId: string, ip: string): Promise<void> {
  const burst = await takeRateLimit(
    `mentions:read:burst:${userId}:${ip}`,
    RATE_LIMITS.burstPerUserIp.limit,
    RATE_LIMITS.burstPerUserIp.windowMs,
  )
  if (!burst.allowed) {
    throw tooManyRequests()
  }

  const perUser = await takeRateLimit(
    `mentions:read:user:${userId}`,
    RATE_LIMITS.perUserMinute.limit,
    RATE_LIMITS.perUserMinute.windowMs,
  )
  if (!perUser.allowed) {
    throw tooManyRequests()
  }

  const perIp = await takeRateLimit(
    `mentions:read:ip:${ip}`,
    RATE_LIMITS.perIpMinute.limit,
    RATE_LIMITS.perIpMinute.windowMs,
  )
  if (!perIp.allowed) {
    throw tooManyRequests()
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    await enforceMentionsRateLimits(auth.userId, ip)

    const body = await parseJsonBody<MentionBody>(request)
    const platforms = parsePlatforms(body.platforms, 10)

    const perPlatformLimit = Math.min(Math.max(Number(body.limit ?? 100), 10), MAX_PER_PLATFORM_LIMIT)
    const cutoff = new Date()
    cutoff.setUTCHours(0, 0, 0, 0)
    cutoff.setUTCDate(cutoff.getUTCDate() - HISTORY_DAYS)
    const timeFilter = `&mentions.published_at=gte.${encodeURIComponent(cutoff.toISOString())}`
    const perPlatformRowLimit = Math.min(perPlatformLimit * 6, 1800)
    const rowsByPlatform = await Promise.all(
      platforms.map((platform) =>
        restRequest<MentionMatchRow[]>(
          `/mention_matches?user_id=eq.${encodeURIComponent(
            auth.userId,
          )}&select=matched_query,matched_at,keywords!inner(is_active),mentions!inner(platform,external_id,url,title,body_excerpt,author,community,published_at)&keywords.is_active=is.true&mentions.platform=eq.${platform}${timeFilter}&order=matched_at.desc&limit=${perPlatformRowLimit}`,
          auth.accessToken,
        ),
      ),
    )
    const rows = rowsByPlatform.flat()

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
    const independentMentions = fairLimitMentionsPerPlatform(mentions, platforms, perPlatformLimit)
    const latestMatchedAt = latestMatchedIso(rows)

    const response = NextResponse.json({
      fetchedAt: new Date().toISOString(),
      latestMatchedAt,
      sourceErrors: [],
      mentions: independentMentions,
    })

    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/mentions", error, "Unable to fetch mentions right now.")
  }
}
