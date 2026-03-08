import { NextRequest, NextResponse } from "next/server"

import { requireAuth } from "@/lib/server/authz"
import { toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { ensureProfile, listKeywords, restRequest } from "@/lib/server/supabase"
import { telegramConfigured, type TelegramSubscriptionRow } from "@/lib/server/telegram"
import { withSessionCookie } from "@/lib/server/session"
import { isTrialExpired } from "@/lib/server/validation"

type SlackProfileRow = {
  slack_webhook_url_enc: string | null
}

function toWebhookHint(webhookUrl: string | null): string | null {
  if (!webhookUrl) {
    return null
  }

  try {
    const parsed = new URL(webhookUrl)
    const segments = parsed.pathname.split("/").filter(Boolean)
    const tail = segments.at(-1)
    if (!tail) {
      return parsed.hostname
    }
    return `${parsed.hostname}/.../${tail.slice(-6)}`
  } catch {
    return "Saved webhook"
  }
}

async function getSlackWebhook(accessToken: string, userId: string): Promise<string | null> {
  const rows = await restRequest<SlackProfileRow[]>(
    `/profiles?id=eq.${encodeURIComponent(userId)}&select=slack_webhook_url_enc`,
    accessToken,
  )
  const raw = rows[0]?.slack_webhook_url_enc
  return typeof raw === "string" && raw.trim() ? raw.trim() : null
}

async function getTelegramSubscription(accessToken: string, userId: string): Promise<TelegramSubscriptionRow | null> {
  const rows = await restRequest<TelegramSubscriptionRow[]>(
    `/telegram_subscriptions?user_id=eq.${encodeURIComponent(
      userId,
    )}&select=user_id,chat_id,alerts_enabled,keyword_filter,platform_filter,link_token,link_token_expires_at,connected_at,paused_at,last_alert_sent_at,last_delivered_match_at,last_error,last_error_at&limit=1`,
    accessToken,
  )
  return rows[0] ?? null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`settings:bootstrap:${auth.userId}:${ip}`, 60, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const profile = await ensureProfile(auth.accessToken, auth.userId, auth.email)
    const nextRoute = !profile.plan_selected_at
      ? "/pricing"
      : isTrialExpired(profile)
        ? "/upgrade"
        : !profile.onboarding_completed
          ? "/onboarding"
          : "/settings"

    const [keywords, slackWebhook, telegramSubscription] = nextRoute === "/settings"
      ? await Promise.all([
          listKeywords(auth.accessToken, profile.id, false),
          getSlackWebhook(auth.accessToken, profile.id),
          telegramConfigured() ? getTelegramSubscription(auth.accessToken, profile.id) : Promise.resolve(null),
        ])
      : [[], null, null]

    const response = NextResponse.json({
      user: auth.user,
      profile,
      keywords,
      slack: {
        connected: Boolean(slackWebhook),
        webhookHint: toWebhookHint(slackWebhook),
        canUseSlack: profile.plan_tier === "growth_15",
      },
      telegram: {
        configured: telegramConfigured(),
        connected: Boolean(telegramSubscription?.chat_id),
        alertsEnabled: telegramSubscription?.alerts_enabled ?? true,
        paused: Boolean(telegramSubscription?.paused_at) || telegramSubscription?.alerts_enabled === false,
        keywordFilter: telegramSubscription?.keyword_filter ?? null,
        platformFilter: telegramSubscription?.platform_filter ?? null,
      },
      nextRoute,
    })

    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/settings/bootstrap", error, "Unable to load settings.")
  }
}
