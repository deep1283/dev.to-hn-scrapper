import { NextRequest, NextResponse } from "next/server"

import { isPlanId, type PlanId } from "@/lib/plans"
import { requireEntitledAuth } from "@/lib/server/authz"
import { AppError, badRequest, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { withSessionCookie } from "@/lib/server/session"
import { patchProfile } from "@/lib/server/supabase"

type SubscriptionItem = {
  subscription_id?: string
  status?: string
  created_at?: string
  product_id?: string
  next_billing_date?: string
  billing_cycle_end?: string
  current_period_end?: string
  customer?: {
    email?: string
  }
}

type ListSubscriptionsResponse = {
  items?: SubscriptionItem[]
}

type RetrieveSubscriptionResponse = {
  subscription_id?: string
  status?: string
  created_at?: string
  product_id?: string
  next_billing_date?: string
  billing_cycle_end?: string
  current_period_end?: string
}

const PLAN_RANK: Record<PlanId, number> = {
  starter_9: 1,
  growth_15: 2,
}

const PRODUCT_IDS: Record<PlanId, string | undefined> = {
  starter_9: process.env.DODO_PRODUCT_ID_PLUS,
  growth_15: process.env.DODO_PRODUCT_ID_PRO,
}

function getDodoConfig() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  const mode = (process.env.DODO_PAYMENTS_MODE ?? "live").toLowerCase()
  const defaultBaseUrl = mode === "test" ? "https://test.dodopayments.com" : "https://live.dodopayments.com"
  const baseUrl = (process.env.DODO_API_BASE_URL ?? defaultBaseUrl).replace(/\/+$/, "")

  if (!apiKey) {
    throw new AppError(500, "Plan change is not configured.", "Missing DODO_PAYMENTS_API_KEY.")
  }

  return { apiKey, baseUrl }
}

function redirectWithStatus(request: NextRequest, params: Record<string, string>) {
  const destination = new URL("/pricing", request.url)
  destination.searchParams.set("manage", "1")
  for (const [key, value] of Object.entries(params)) {
    destination.searchParams.set(key, value)
  }
  return NextResponse.redirect(destination)
}

function normalizeEmail(email?: string): string {
  return (email ?? "").trim().toLowerCase()
}

function toFutureIso(raw: string | undefined): string | null {
  if (!raw) {
    return null
  }

  const parsed = new Date(raw).getTime()
  if (!Number.isFinite(parsed) || parsed <= Date.now()) {
    return null
  }

  return new Date(parsed).toISOString()
}

function subscriptionPeriodEnd(subscription: SubscriptionItem): string | null {
  return (
    toFutureIso(subscription.next_billing_date) ??
    toFutureIso(subscription.billing_cycle_end) ??
    toFutureIso(subscription.current_period_end)
  )
}

async function listSubscriptionsByEmail(baseUrl: string, apiKey: string, email: string): Promise<SubscriptionItem[]> {
  const normalizedEmail = normalizeEmail(email)
  const results: SubscriptionItem[] = []

  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${baseUrl}/subscriptions`)
    url.searchParams.set("page_size", "100")
    url.searchParams.set("page_number", String(page))

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      throw new AppError(502, "Unable to load subscriptions.", `Dodo subscriptions list failed (${response.status})`)
    }

    const payload = (await response.json().catch(() => null)) as ListSubscriptionsResponse | null
    const items = Array.isArray(payload?.items) ? payload.items : []

    const matches = items.filter((item) => normalizeEmail(item.customer?.email) === normalizedEmail)
    results.push(...matches)

    if (items.length < 100) {
      break
    }
  }

  return results
}

function pickActiveSubscription(subscriptions: SubscriptionItem[]): SubscriptionItem | null {
  const statusRank: Record<string, number> = {
    active: 5,
    pending: 4,
    on_hold: 3,
    failed: 2,
    cancelled: 1,
    expired: 0,
  }

  const knownProducts = new Set(Object.values(PRODUCT_IDS).filter((value): value is string => Boolean(value)))
  const candidates = subscriptions.filter((item) => {
    if (!item.subscription_id) {
      return false
    }

    const status = (item.status ?? "").toLowerCase()
    if (status === "cancelled" || status === "expired") {
      return false
    }

    if (!item.product_id) {
      return true
    }

    return knownProducts.has(item.product_id)
  })

  if (!candidates.length) {
    return null
  }

  candidates.sort((left, right) => {
    const leftStatus = statusRank[(left.status ?? "").toLowerCase()] ?? -1
    const rightStatus = statusRank[(right.status ?? "").toLowerCase()] ?? -1
    if (leftStatus !== rightStatus) {
      return rightStatus - leftStatus
    }

    const leftTime = new Date(left.created_at ?? 0).getTime()
    const rightTime = new Date(right.created_at ?? 0).getTime()
    return rightTime - leftTime
  })

  return candidates[0] ?? null
}

async function changeSubscriptionPlan(baseUrl: string, apiKey: string, subscriptionId: string, targetPlan: PlanId) {
  const productId = PRODUCT_IDS[targetPlan]
  if (!productId) {
    throw new AppError(500, "Plan change is not configured.", `Missing Dodo product mapping for ${targetPlan}.`)
  }

  const response = await fetch(`${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}/change-plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      quantity: 1,
      proration_billing_mode: "difference_immediately",
      on_payment_failure: "prevent_change",
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
    const details = payload?.message ?? payload?.error ?? `Dodo plan change failed (${response.status})`
    throw new AppError(400, "Unable to change plan.", details)
  }
}

async function retrieveSubscription(baseUrl: string, apiKey: string, subscriptionId: string): Promise<SubscriptionItem | null> {
  const response = await fetch(`${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json().catch(() => null)) as RetrieveSubscriptionResponse | null
  if (!payload?.subscription_id) {
    return null
  }

  return {
    subscription_id: payload.subscription_id,
    status: payload.status,
    created_at: payload.created_at,
    product_id: payload.product_id,
    next_billing_date: payload.next_billing_date,
    billing_cycle_end: payload.billing_cycle_end,
    current_period_end: payload.current_period_end,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)

    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`billing:change-plan:${auth.userId}:${ip}`, 20, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests("Too many plan change attempts. Please wait and try again.")
    }

    const targetRaw = request.nextUrl.searchParams.get("plan")
    if (!isPlanId(targetRaw)) {
      throw badRequest("Invalid plan selected.")
    }
    const targetPlan = targetRaw

    const currentPlan = auth.profile.plan_tier
    if (targetPlan === currentPlan) {
      const redirect = redirectWithStatus(request, { plan_change: "noop" })
      return withSessionCookie(redirect, auth.sessionResult)
    }

    const direction = PLAN_RANK[targetPlan] > PLAN_RANK[currentPlan] ? "upgrade" : "downgrade"

    const { apiKey, baseUrl } = getDodoConfig()
    const customerEmail = auth.email
    if (!customerEmail) {
      throw badRequest("No email found for this account. Please log in again.")
    }

    const subscriptions = await listSubscriptionsByEmail(baseUrl, apiKey, customerEmail)
    const activeSubscription = pickActiveSubscription(subscriptions)

    if (!activeSubscription?.subscription_id) {
      if (direction === "upgrade") {
        const fallback = new URL(`/api/dodo/checkout?plan=${targetPlan}&billing=paid`, request.url)
        const redirect = NextResponse.redirect(fallback)
        return withSessionCookie(redirect, auth.sessionResult)
      }

      const redirect = redirectWithStatus(request, {
        plan_change: "error",
        reason: "Could not find an active subscription for scheduled downgrade.",
      })
      return withSessionCookie(redirect, auth.sessionResult)
    }

    const nowIso = new Date().toISOString()
    const existingPlanSelectedAt = auth.profile.plan_selected_at ?? nowIso
    let scheduledEffectiveAt: string | null = null

    if (direction === "upgrade") {
      await changeSubscriptionPlan(baseUrl, apiKey, activeSubscription.subscription_id, targetPlan)
      await patchProfile(auth.accessToken, auth.userId, {
        plan_tier: targetPlan,
        billing_mode: "paid",
        plan_selected_at: existingPlanSelectedAt,
        pending_plan_tier: null,
        pending_plan_effective_at: null,
      })
    } else {
      let effectiveAt = subscriptionPeriodEnd(activeSubscription)
      if (!effectiveAt) {
        const refreshedSubscription = await retrieveSubscription(baseUrl, apiKey, activeSubscription.subscription_id)
        effectiveAt = refreshedSubscription ? subscriptionPeriodEnd(refreshedSubscription) : null
      }
      if (!effectiveAt) {
        throw badRequest("Unable to determine your current billing period end for scheduling this downgrade.")
      }
      scheduledEffectiveAt = effectiveAt

      await patchProfile(auth.accessToken, auth.userId, {
        billing_mode: "paid",
        plan_selected_at: existingPlanSelectedAt,
        pending_plan_tier: targetPlan,
        pending_plan_effective_at: effectiveAt,
      })

      try {
        await changeSubscriptionPlan(baseUrl, apiKey, activeSubscription.subscription_id, targetPlan)
      } catch (changeError) {
        await patchProfile(auth.accessToken, auth.userId, {
          pending_plan_tier: null,
          pending_plan_effective_at: null,
        }).catch(() => undefined)
        throw changeError
      }
    }

    const redirect = redirectWithStatus(request, {
      plan_change: "success",
      mode: direction,
      target: targetPlan,
      ...(direction === "downgrade" && scheduledEffectiveAt ? { effective: scheduledEffectiveAt } : {}),
    })
    return withSessionCookie(redirect, auth.sessionResult)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to change plan."
    const redirect = redirectWithStatus(request, {
      plan_change: "error",
      reason: message.slice(0, 180),
    })
    return redirect
  }
}
