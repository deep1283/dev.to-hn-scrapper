import { PLAN_CONFIG, isPlanId, type PlanId } from "@/lib/plans"
import { badRequest, forbidden, paymentRequired } from "@/lib/server/errors"
import type { ProfileRow } from "@/lib/server/supabase"

export function normalizeInput(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function sanitizeStringList(value: unknown, maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const output: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== "string") {
      continue
    }
    const normalized = normalizeInput(item).slice(0, maxItemLength)
    if (!normalized) {
      continue
    }
    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(normalized)
    if (output.length >= maxItems) {
      break
    }
  }

  return output
}

export function parsePlanId(value: unknown): PlanId {
  if (typeof value !== "string" || !isPlanId(value)) {
    throw badRequest("Invalid plan selected.")
  }
  return value
}

export function assertPlanCounts(planId: PlanId, keywords: string[]) {
  const plan = PLAN_CONFIG[planId]
  if (keywords.length > plan.maxKeywords) {
    throw badRequest(`Your ${plan.name} plan supports up to ${plan.maxKeywords} keywords.`)
  }
}

export function isTrialExpired(profile: Pick<ProfileRow, "billing_mode" | "trial_ends_at">): boolean {
  if (profile.billing_mode !== "trial" || !profile.trial_ends_at) {
    return false
  }

  const expiresAt = new Date(profile.trial_ends_at).getTime()
  return !Number.isNaN(expiresAt) && expiresAt <= Date.now()
}

export function ensureActiveEntitlement(
  profile: Pick<ProfileRow, "plan_selected_at" | "billing_mode" | "trial_ends_at">,
) {
  if (!profile.plan_selected_at) {
    throw badRequest("Select a plan to continue.")
  }

  if (isTrialExpired(profile)) {
    throw paymentRequired()
  }
}

export function ensureProPlan(profile: Pick<ProfileRow, "plan_tier">) {
  if (profile.plan_tier !== "growth_15") {
    throw forbidden("Slack updates are available on Pro plan.")
  }
}

export function parseSlackWebhookUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw badRequest("Slack webhook URL is required.")
  }

  const normalized = value.trim()
  if (!normalized) {
    throw badRequest("Slack webhook URL is required.")
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw badRequest("Enter a valid Slack webhook URL.")
  }

  const hostname = parsed.hostname.toLowerCase()
  const path = parsed.pathname
  const isSlackHost = hostname === "hooks.slack.com" || hostname === "hooks.slack-gov.com"
  if (parsed.protocol !== "https:" || !isSlackHost || !path.startsWith("/services/")) {
    throw badRequest("Enter a valid Slack incoming webhook URL.")
  }

  return parsed.toString()
}

export function validateEmail(rawEmail: unknown): string {
  if (typeof rawEmail !== "string") {
    throw badRequest("Email is required.")
  }
  const email = rawEmail.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw badRequest("Enter a valid email address.")
  }
  return email
}

export function validatePassword(rawPassword: unknown): string {
  if (typeof rawPassword !== "string") {
    throw badRequest("Password is required.")
  }
  if (rawPassword.length < 8 || rawPassword.length > 128) {
    throw badRequest("Password must be between 8 and 128 characters.")
  }
  return rawPassword
}
