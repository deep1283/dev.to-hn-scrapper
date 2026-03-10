import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { restRequest } from "@/lib/server/supabase"
import {
  buildTelegramBotLink,
  getTelegramBotInfo,
  telegramConfigured,
  type TelegramSubscriptionRow,
} from "@/lib/server/telegram"
import { withSessionCookie } from "@/lib/server/session"

type ConnectResponse = {
  configured: boolean
  connected: boolean
  alertsEnabled: boolean
  paused: boolean
  keywordFilter: string | null
  platformFilter: string | null
  botUsername: string | null
  botLink: string | null
  startCode: string | null
  linkExpiresAt: string | null
  message: string
}

function isMissingPendingActionColumn(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("pending_action")
}

async function getSubscription(accessToken: string, userId: string): Promise<TelegramSubscriptionRow | null> {
  const basePath = `/telegram_subscriptions?user_id=eq.${encodeURIComponent(
    userId,
  )}&select=user_id,chat_id,alerts_enabled,keyword_filter,platform_filter,link_token,link_token_expires_at,connected_at,paused_at,last_alert_sent_at,last_delivered_match_at,last_error,last_error_at&limit=1`

  try {
    const rows = await restRequest<TelegramSubscriptionRow[]>(
      basePath.replace("platform_filter,", "platform_filter,pending_action,"),
      accessToken,
    )
    return rows[0] ?? null
  } catch (error) {
    if (!isMissingPendingActionColumn(error)) {
      throw error
    }
    const rows = await restRequest<Array<Omit<TelegramSubscriptionRow, "pending_action">>>(
      basePath,
      accessToken,
    )
    return rows[0] ? { ...rows[0], pending_action: null } : null
  }
}

async function patchSubscription(
  accessToken: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<TelegramSubscriptionRow | null> {
  const path = `/telegram_subscriptions?user_id=eq.${encodeURIComponent(userId)}`
  try {
    const rows = await restRequest<TelegramSubscriptionRow[]>(
      path,
      accessToken,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    )
    return rows[0] ?? null
  } catch (error) {
    if (!isMissingPendingActionColumn(error)) {
      throw error
    }
    const fallbackPatch = { ...patch }
    delete fallbackPatch.pending_action
    const rows = await restRequest<Array<Omit<TelegramSubscriptionRow, "pending_action">>>(
      path,
      accessToken,
      {
        method: "PATCH",
        body: JSON.stringify(fallbackPatch),
      },
    )
    return rows[0] ? { ...rows[0], pending_action: null } : null
  }
}

function toStatusPayload(subscription: TelegramSubscriptionRow | null, configured: boolean) {
  return {
    configured,
    connected: Boolean(subscription?.chat_id),
    alertsEnabled: subscription?.alerts_enabled ?? true,
    paused: Boolean(subscription?.paused_at) || subscription?.alerts_enabled === false,
    keywordFilter: subscription?.keyword_filter ?? null,
    platformFilter: subscription?.platform_filter ?? null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`integrations:telegram:status:${auth.userId}:${ip}`, 60, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const configured = telegramConfigured()
    const subscription = configured ? await getSubscription(auth.accessToken, auth.userId) : null

    const response = NextResponse.json(toStatusPayload(subscription, configured))
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/integrations/telegram:get", error, "Unable to load Telegram integration.")
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`integrations:telegram:connect:${auth.userId}:${ip}`, 12, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    if (!telegramConfigured()) {
      throw badRequest("Telegram is not configured yet.")
    }

    const existing = await getSubscription(auth.accessToken, auth.userId)
    const linkToken = crypto.randomUUID()
    const linkExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    let subscription: TelegramSubscriptionRow
    if (existing) {
      subscription = (await patchSubscription(auth.accessToken, auth.userId, {
        link_token: linkToken,
        link_token_expires_at: linkExpiresAt,
        pending_action: null,
        last_error: null,
        last_error_at: null,
      })) ?? {
        ...existing,
        pending_action: null,
        link_token: linkToken,
        link_token_expires_at: linkExpiresAt,
      }
    } else {
      const rows = await restRequest<TelegramSubscriptionRow[]>(`/telegram_subscriptions`, auth.accessToken, {
        method: "POST",
        body: JSON.stringify([
          {
            user_id: auth.userId,
            link_token: linkToken,
            link_token_expires_at: linkExpiresAt,
          },
        ]),
      })
      if (!rows[0]) {
        throw badRequest("Unable to initialize Telegram connection.")
      }
      subscription = rows[0]
    }

    const botInfo = await getTelegramBotInfo()
    const responsePayload: ConnectResponse = {
      ...toStatusPayload(subscription, true),
      botUsername: botInfo?.username ?? null,
      botLink: buildTelegramBotLink(botInfo?.username, subscription.link_token),
      startCode: subscription.link_token,
      linkExpiresAt: subscription.link_token_expires_at,
      message: subscription.chat_id
        ? "Telegram link refreshed. Send the new /start code in the bot if you want to reconnect this chat."
        : "Open the Telegram bot and send the start code to connect your account.",
    }

    const response = NextResponse.json(responsePayload)
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/integrations/telegram:post", error, "Unable to prepare Telegram connection.")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`integrations:telegram:disconnect:${auth.userId}:${ip}`, 12, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const subscription =
      (await patchSubscription(auth.accessToken, auth.userId, {
        chat_id: null,
        alerts_enabled: false,
        connected_at: null,
        paused_at: null,
        pending_action: null,
        last_alert_sent_at: null,
        last_delivered_match_at: null,
        last_error: null,
        last_error_at: null,
        link_token: crypto.randomUUID(),
        link_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })) ?? null
    const response = NextResponse.json({
      ...toStatusPayload(subscription, telegramConfigured()),
      message: "Telegram disconnected.",
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/integrations/telegram:delete", error, "Unable to disconnect Telegram.")
  }
}
