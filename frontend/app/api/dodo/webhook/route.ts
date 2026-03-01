import { createHash, createHmac, timingSafeEqual } from "crypto"

import { NextRequest, NextResponse } from "next/server"

import { AppError, badRequest, toErrorResponse, tooManyRequests, unauthorized } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { parsePlanId } from "@/lib/server/validation"

type Metadata = Record<string, unknown>

type DodoEvent = {
  id?: string
  type?: string
  event?: string
  metadata?: Metadata
  data?: {
    metadata?: Metadata
    customer?: {
      email?: string
    }
    payment?: {
      metadata?: Metadata
      customer?: {
        email?: string
      }
    }
    subscription?: {
      metadata?: Metadata
      customer?: {
        email?: string
      }
    }
  }
  customer?: {
    email?: string
  }
}

type ProfileSnapshot = {
  id: string
  email: string | null
  plan_tier: "starter_9" | "growth_15"
  pending_plan_tier: "starter_9" | "growth_15" | null
  pending_plan_effective_at: string | null
  billing_mode: "trial" | "paid" | null
  plan_selected_at: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
}

type TargetProfile = {
  profile: ProfileSnapshot
  filter: string
}

const MAX_WEBHOOK_CLOCK_SKEW_MS = 10 * 60_000
const WEBHOOK_RATE_LIMIT_PER_MINUTE = 180
const WEBHOOK_PREAUTH_RATE_LIMIT_PER_MINUTE = 1200
const FALLBACK_EVENT_MEMORY_LIMIT = 20_000
const FALLBACK_EVENT_TTL_MS = 24 * 60 * 60 * 1000
const FALLBACK_PRUNE_EVERY_CALLS = 100
const fallbackSeenEvents = new Map<string, number>()
let fallbackReserveCalls = 0

function getServiceEnv() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    throw new AppError(500, "Webhook is not configured.")
  }

  return { supabaseUrl, serviceRoleKey, webhookSecret }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}

function parseSignatureCandidates(signatureHeader: string | null): string[] {
  if (!signatureHeader) {
    return []
  }

  const tokens = signatureHeader
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)

  const values: string[] = []
  for (const token of tokens) {
    if (token.startsWith("v1,")) {
      values.push(token.slice(3))
      continue
    }
    if (token.startsWith("v1=")) {
      values.push(token.slice(3))
      continue
    }
    values.push(token)
  }

  return values
}

function parseWebhookTimestampMs(raw: string | null): number | null {
  if (!raw) {
    return null
  }

  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) {
    return null
  }

  const asMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000
  if (!Number.isFinite(asMs) || asMs <= 0) {
    return null
  }
  return Math.floor(asMs)
}

function ensureRecentTimestamp(request: NextRequest) {
  const parsed = parseWebhookTimestampMs(request.headers.get("webhook-timestamp"))
  if (parsed === null) {
    return
  }

  if (Math.abs(Date.now() - parsed) > MAX_WEBHOOK_CLOCK_SKEW_MS) {
    throw unauthorized("Webhook timestamp is outside the allowed window.")
  }
}

function verifyWebhookSignature(request: NextRequest, rawBody: string, secret: string): boolean {
  const webhookId = request.headers.get("webhook-id")
  const webhookTimestamp = request.headers.get("webhook-timestamp")
  const webhookSignature = request.headers.get("webhook-signature")

  if (webhookId && webhookTimestamp && webhookSignature) {
    const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`
    const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("base64")
    const candidates = parseSignatureCandidates(webhookSignature)
    return candidates.some((candidate) => safeEqual(candidate, expected))
  }

  const fallbackSignature =
    request.headers.get("x-dodo-signature") ??
    request.headers.get("x-webhook-signature") ??
    request.headers.get("x-signature")
  if (!fallbackSignature) {
    return false
  }

  const normalized = fallbackSignature.startsWith("sha256=")
    ? fallbackSignature.slice("sha256=".length)
    : fallbackSignature

  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  return safeEqual(normalized, expectedHex)
}

function getEventType(payload: DodoEvent): string {
  return String(payload.type ?? payload.event ?? "").toLowerCase()
}

function isSuccessfulEvent(type: string): boolean {
  return type.includes("success") || type.includes("completed") || type.includes("active")
}

function getMetadata(payload: DodoEvent): Metadata {
  return (
    payload.data?.payment?.metadata ??
    payload.data?.subscription?.metadata ??
    payload.data?.metadata ??
    payload.metadata ??
    {}
  )
}

function inferPlanId(payload: DodoEvent): "starter_9" | "growth_15" {
  const metadata = getMetadata(payload)
  const raw =
    String(metadata.planId ?? metadata.plan_id ?? metadata.plan ?? metadata.tier ?? "").toLowerCase() ||
    String(metadata.product ?? metadata.product_id ?? "").toLowerCase()

  if (raw.includes("growth") || raw.includes("pro") || raw.includes("15")) {
    return parsePlanId("growth_15")
  }
  return parsePlanId("starter_9")
}

const PLAN_RANK: Record<"starter_9" | "growth_15", number> = {
  starter_9: 1,
  growth_15: 2,
}

function getUserId(payload: DodoEvent): string | null {
  const metadata = getMetadata(payload)
  const candidate = metadata.userId ?? metadata.user_id ?? metadata.supabase_user_id
  if (typeof candidate !== "string" || !candidate.trim()) {
    return null
  }
  return candidate.trim()
}

function getEmail(payload: DodoEvent): string | null {
  const value =
    payload.data?.payment?.customer?.email ??
    payload.data?.subscription?.customer?.email ??
    payload.data?.customer?.email ??
    payload.customer?.email
  if (!value || typeof value !== "string") {
    return null
  }
  return value.trim().toLowerCase()
}

function getMetadataValue(metadata: Metadata, keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}

function inferBillingMode(payload: DodoEvent): "trial" | "paid" {
  const metadata = getMetadata(payload)
  const raw = getMetadataValue(metadata, ["billing_mode", "billingMode"]).toLowerCase()
  return raw === "paid" ? "paid" : "trial"
}

function inferTrialDays(payload: DodoEvent): number {
  const metadata = getMetadata(payload)
  const raw = getMetadataValue(metadata, ["trial_days", "trialDays"])
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }
  return Math.min(Math.floor(parsed), 30)
}

function getEventId(request: NextRequest, payload: DodoEvent, rawBody: string): string {
  const fromHeader = request.headers.get("webhook-id")
  if (fromHeader?.trim()) {
    return fromHeader.trim()
  }

  if (typeof payload.id === "string" && payload.id.trim()) {
    return payload.id.trim()
  }

  return createHash("sha256").update(rawBody, "utf8").digest("hex")
}

function headersForServiceRole(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  }
}

async function getProfileByFilter(
  supabaseUrl: string,
  serviceRoleKey: string,
  filter: string,
): Promise<ProfileSnapshot | null> {
  const primary = await fetch(
    `${supabaseUrl}/rest/v1/profiles?${filter}&select=id,email,plan_tier,pending_plan_tier,pending_plan_effective_at,billing_mode,plan_selected_at,trial_started_at,trial_ends_at&limit=1`,
    {
      method: "GET",
      headers: headersForServiceRole(serviceRoleKey),
      cache: "no-store",
    },
  )

  if (primary.ok) {
    const rows = (await primary.json().catch(() => [])) as ProfileSnapshot[]
    return rows[0] ?? null
  }

  const primaryError = await primary.text().catch(() => "")
  if (!primaryError.toLowerCase().includes("pending_plan_tier")) {
    throw new Error(`Supabase profile fetch failed (${primary.status})`)
  }

  const fallback = await fetch(
    `${supabaseUrl}/rest/v1/profiles?${filter}&select=id,email,plan_tier,billing_mode,plan_selected_at,trial_started_at,trial_ends_at&limit=1`,
    {
      method: "GET",
      headers: headersForServiceRole(serviceRoleKey),
      cache: "no-store",
    },
  )

  if (!fallback.ok) {
    throw new Error(`Supabase profile fetch failed (${fallback.status})`)
  }

  const rows = (await fallback.json().catch(() => [])) as Array<
    Omit<ProfileSnapshot, "pending_plan_tier" | "pending_plan_effective_at">
  >
  const row = rows[0]
  if (!row) {
    return null
  }

  return {
    ...row,
    pending_plan_tier: null,
    pending_plan_effective_at: null,
  }
}

async function resolveTargetProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: DodoEvent,
): Promise<TargetProfile> {
  const userId = getUserId(payload)
  if (userId) {
    const filter = `id=eq.${encodeURIComponent(userId)}`
    const profile = await getProfileByFilter(supabaseUrl, serviceRoleKey, filter)
    if (profile) {
      return { profile, filter }
    }
  }

  const email = getEmail(payload)
  if (!email) {
    throw badRequest("Webhook payload missing user identifier.")
  }

  const filter = `email=eq.${encodeURIComponent(email)}`
  const profile = await getProfileByFilter(supabaseUrl, serviceRoleKey, filter)
  if (!profile) {
    throw badRequest("No profile found for webhook customer.")
  }

  return { profile, filter }
}

function buildProfilePatch(existing: ProfileSnapshot, payload: DodoEvent, eventType: string, nowIso: string): Record<string, unknown> {
  const planId = inferPlanId(payload)
  const isUpgrade = PLAN_RANK[planId] > PLAN_RANK[existing.plan_tier]
  const isDowngrade = PLAN_RANK[planId] < PLAN_RANK[existing.plan_tier]
  const checkoutBillingMode = inferBillingMode(payload)
  const checkoutTrialDays = inferTrialDays(payload)
  const isPaidEvent =
    eventType.includes("payment.succeeded") || eventType.includes("subscription.renewed") || eventType.includes("invoice.paid")

  const pendingEffectiveAtMs = existing.pending_plan_effective_at ? new Date(existing.pending_plan_effective_at).getTime() : NaN
  const hasFuturePendingDowngrade =
    existing.pending_plan_tier !== null &&
    PLAN_RANK[existing.pending_plan_tier] < PLAN_RANK[existing.plan_tier] &&
    Number.isFinite(pendingEffectiveAtMs) &&
    pendingEffectiveAtMs > Date.now()

  if (hasFuturePendingDowngrade && isDowngrade) {
    return {
      plan_tier: existing.plan_tier,
      pending_plan_tier: existing.pending_plan_tier,
      pending_plan_effective_at: existing.pending_plan_effective_at,
      plan_selected_at: existing.plan_selected_at ?? nowIso,
      billing_mode: "paid",
      trial_started_at: null,
      trial_ends_at: null,
    }
  }

  if (isUpgrade) {
    return {
      plan_tier: planId,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
      plan_selected_at: existing.plan_selected_at ?? nowIso,
      billing_mode: "paid",
      trial_started_at: null,
      trial_ends_at: null,
    }
  }

  if (existing.billing_mode === "paid" && !isPaidEvent) {
    return {
      plan_tier: planId,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
      plan_selected_at: existing.plan_selected_at ?? nowIso,
      billing_mode: "paid",
      trial_started_at: null,
      trial_ends_at: null,
    }
  }

  if (isPaidEvent) {
    return {
      plan_tier: planId,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
      plan_selected_at: existing.plan_selected_at ?? nowIso,
      billing_mode: "paid",
      trial_started_at: null,
      trial_ends_at: null,
    }
  }

  if (checkoutBillingMode === "trial" && checkoutTrialDays > 0) {
    if (existing.trial_started_at && existing.trial_ends_at) {
      return {
        plan_tier: planId,
        pending_plan_tier: null,
        pending_plan_effective_at: null,
        plan_selected_at: existing.plan_selected_at ?? nowIso,
        billing_mode: "trial",
        trial_started_at: existing.trial_started_at,
        trial_ends_at: existing.trial_ends_at,
      }
    }

    return {
      plan_tier: planId,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
      plan_selected_at: existing.plan_selected_at ?? nowIso,
      billing_mode: "trial",
      trial_started_at: nowIso,
      trial_ends_at: new Date(Date.now() + checkoutTrialDays * 24 * 60 * 60 * 1000).toISOString(),
    }
  }

  return {
    plan_tier: planId,
    pending_plan_tier: null,
    pending_plan_effective_at: null,
    plan_selected_at: existing.plan_selected_at ?? nowIso,
    billing_mode: "paid",
    trial_started_at: null,
    trial_ends_at: null,
  }
}

async function patchProfileByFilter(
  supabaseUrl: string,
  serviceRoleKey: string,
  filter: string,
  patch: Record<string, unknown>,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?${filter}`, {
    method: "PATCH",
    headers: {
      ...headersForServiceRole(serviceRoleKey),
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Supabase webhook patch failed (${response.status})`)
  }

  return (await response.json().catch(() => [])) as Array<Record<string, unknown>>
}

function pruneFallbackEventMemory(now: number) {
  // Always evict expired entries first.
  for (const [key, seenAt] of fallbackSeenEvents.entries()) {
    if (now - seenAt > FALLBACK_EVENT_TTL_MS) {
      fallbackSeenEvents.delete(key)
    }
  }

  // Enforce hard cap if needed (Map preserves insertion order).
  if (fallbackSeenEvents.size <= FALLBACK_EVENT_MEMORY_LIMIT) {
    return
  }

  for (const key of fallbackSeenEvents.keys()) {
    fallbackSeenEvents.delete(key)
    if (fallbackSeenEvents.size <= FALLBACK_EVENT_MEMORY_LIMIT) {
      break
    }
  }
}

function reserveFallbackEvent(provider: string, eventId: string): boolean {
  const now = Date.now()
  fallbackReserveCalls += 1
  if (
    fallbackSeenEvents.size >= FALLBACK_EVENT_MEMORY_LIMIT ||
    fallbackReserveCalls % FALLBACK_PRUNE_EVERY_CALLS === 0
  ) {
    pruneFallbackEventMemory(now)
  }

  const key = `${provider}:${eventId}`
  if (fallbackSeenEvents.has(key)) {
    return false
  }

  fallbackSeenEvents.set(key, now)
  return true
}

async function reserveWebhookEvent(
  supabaseUrl: string,
  serviceRoleKey: string,
  provider: string,
  eventId: string,
): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/rest/v1/webhook_events?on_conflict=provider,event_id`, {
    method: "POST",
    headers: {
      ...headersForServiceRole(serviceRoleKey),
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify([{ provider, event_id: eventId }]),
    cache: "no-store",
  })

  if (response.status === 404) {
    return reserveFallbackEvent(provider, eventId)
  }

  if (!response.ok) {
    throw new Error(`Webhook idempotency insert failed (${response.status})`)
  }

  const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>
  return rows.length > 0
}

export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, serviceRoleKey, webhookSecret } = getServiceEnv()

    const ip = getRequestIp(request)
    const preauthLimit = await takeRateLimit(`dodo:webhook:preauth:${ip}`, WEBHOOK_PREAUTH_RATE_LIMIT_PER_MINUTE, 60_000)
    if (!preauthLimit.allowed) {
      throw tooManyRequests("Webhook rate limit exceeded.")
    }

    const rawBody = await request.text()
    ensureRecentTimestamp(request)

    if (!verifyWebhookSignature(request, rawBody, webhookSecret)) {
      throw unauthorized("Invalid webhook signature.")
    }

    const limit = await takeRateLimit(`dodo:webhook:${ip}`, WEBHOOK_RATE_LIMIT_PER_MINUTE, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests("Webhook rate limit exceeded.")
    }

    const payload = JSON.parse(rawBody) as DodoEvent
    const eventType = getEventType(payload)
    if (!eventType) {
      throw badRequest("Missing webhook event type.")
    }

    if (!isSuccessfulEvent(eventType)) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const eventId = getEventId(request, payload, rawBody)
    const firstSeen = await reserveWebhookEvent(supabaseUrl, serviceRoleKey, "dodo", eventId)
    if (!firstSeen) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    const target = await resolveTargetProfile(supabaseUrl, serviceRoleKey, payload)
    const nowIso = new Date().toISOString()
    const patch = buildProfilePatch(target.profile, payload, eventType, nowIso)
    await patchProfileByFilter(supabaseUrl, serviceRoleKey, target.filter, patch)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse("api/dodo/webhook", error, "Webhook processing failed.")
  }
}
