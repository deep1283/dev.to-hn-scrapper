import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/lib/server/errors"
import { serviceRestRequest } from "@/lib/server/supabase"
import {
  getTelegramWebhookSecret,
  normalizeTelegramKeyword,
  parseTelegramLimit,
  parseTelegramPlatform,
  sendTelegramMessage,
  type TelegramPlatform,
  type TelegramSubscriptionRow,
} from "@/lib/server/telegram"
import { ensureActiveEntitlement } from "@/lib/server/validation"

type TelegramChat = {
  id: number
}

type TelegramMessage = {
  message_id: number
  chat: TelegramChat
  text?: string
}

type TelegramUpdate = {
  message?: TelegramMessage
}

type TelegramMentionRow = {
  matched_query: string
  matched_at: string
  platform: TelegramPlatform
  url: string
  title: string | null
  published_at: string
}

type TelegramProfile = {
  id: string
  email: string | null
  plan_tier: "starter_9" | "growth_15"
  billing_mode: "trial" | "paid" | null
  plan_selected_at: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  onboarding_completed: boolean
  created_at: string | null
}

type KeywordRow = {
  query: string
}

function hasServiceTelegramConfig(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim())
}

async function getSubscriptionByChatId(chatId: number): Promise<TelegramSubscriptionRow | null> {
  const rows = await serviceRestRequest<TelegramSubscriptionRow[]>(
    `/telegram_subscriptions?chat_id=eq.${encodeURIComponent(
      String(chatId),
    )}&select=user_id,chat_id,alerts_enabled,keyword_filter,platform_filter,link_token,link_token_expires_at,connected_at,paused_at,last_alert_sent_at,last_delivered_match_at,last_error,last_error_at&limit=1`,
  )
  return rows[0] ?? null
}

async function getSubscriptionByLinkToken(token: string): Promise<TelegramSubscriptionRow | null> {
  const rows = await serviceRestRequest<TelegramSubscriptionRow[]>(
    `/telegram_subscriptions?link_token=eq.${encodeURIComponent(
      token,
    )}&select=user_id,chat_id,alerts_enabled,keyword_filter,platform_filter,link_token,link_token_expires_at,connected_at,paused_at,last_alert_sent_at,last_delivered_match_at,last_error,last_error_at&limit=1`,
  )
  return rows[0] ?? null
}

async function updateSubscription(userId: string, patch: Record<string, unknown>): Promise<TelegramSubscriptionRow | null> {
  const rows = await serviceRestRequest<TelegramSubscriptionRow[]>(
    `/telegram_subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  )
  return rows[0] ?? null
}

async function getProfile(userId: string): Promise<TelegramProfile | null> {
  const rows = await serviceRestRequest<TelegramProfile[]>(
    `/profiles?id=eq.${encodeURIComponent(
      userId,
    )}&select=id,email,plan_tier,billing_mode,plan_selected_at,trial_started_at,trial_ends_at,onboarding_completed,created_at&limit=1`,
  )
  return rows[0] ?? null
}

async function listActiveKeywords(userId: string): Promise<string[]> {
  const rows = await serviceRestRequest<KeywordRow[]>(
    `/keywords?user_id=eq.${encodeURIComponent(userId)}&is_active=is.true&select=query&order=created_at.asc`,
  )
  return rows.map((row) => row.query)
}

async function fetchTelegramMentions(
  userId: string,
  options: {
    limit: number
    keyword: string | null
    platform: TelegramPlatform | null
  },
): Promise<TelegramMentionRow[]> {
  return serviceRestRequest<TelegramMentionRow[]>(`/rpc/fetch_telegram_mentions`, {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_limit: options.limit,
      p_keyword: options.keyword,
      p_platform: options.platform,
    }),
  })
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Unknown time"
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function platformLabel(platform: TelegramPlatform): string {
  if (platform === "hackernews") {
    return "Hacker News"
  }
  if (platform === "github_discussions") {
    return "GitHub Discussions"
  }
  return "Dev.to"
}

function normalizeKeywordAgainstTracked(input: string, trackedKeywords: string[]): string {
  const normalized = normalizeTelegramKeyword(input)
  const matched = trackedKeywords.find((keyword) => keyword.toLowerCase() === normalized.toLowerCase())
  if (!matched) {
    throw new Error("That keyword is not in your tracked list.")
  }
  return matched
}

function buildHelpText(subscription: TelegramSubscriptionRow | null) {
  const keywordFilter = subscription?.keyword_filter ?? "all"
  const platformFilter = subscription?.platform_filter ? platformLabel(subscription.platform_filter) : "all"
  const alertsState = subscription?.alerts_enabled === false ? "paused" : "active"

  return [
    "Signalze Telegram commands",
    "",
    `/latest - show the latest 20 mentions using your saved filters`,
    `/latest 50 - show more (max 100)`,
    `/keyword <tracked keyword> [count] - one-off keyword query`,
    `/platform <hackernews|devto|github_discussions> [count] - one-off platform query`,
    `/setkeyword <tracked keyword|all> - set your saved keyword filter`,
    `/setplatform <hackernews|devto|github_discussions|all> - set your saved platform filter`,
    `/filters - show your current saved filters`,
    `/pause - stop Telegram alerts`,
    `/resume - resume Telegram alerts`,
    `/stop - alias for /pause`,
    "",
    `Saved filters: keyword=${keywordFilter}, platform=${platformFilter}`,
    `Alerts: ${alertsState}`,
  ].join("\n")
}

function buildMentionsMessage(
  rows: TelegramMentionRow[],
  options: {
    requestedLimit: number
    keyword: string | null
    platform: TelegramPlatform | null
  },
): string {
  if (!rows.length) {
    const filters = [
      `keyword=${options.keyword ?? "all"}`,
      `platform=${options.platform ? platformLabel(options.platform) : "all"}`,
    ].join(", ")
    return `No mentions found for ${filters}.`
  }

  const lines = [
    "Signalze mentions",
    `Filters: keyword=${options.keyword ?? "all"}, platform=${options.platform ? platformLabel(options.platform) : "all"}`,
    `Showing ${rows.length} mention${rows.length === 1 ? "" : "s"}${options.requestedLimit > rows.length ? "" : ` (requested ${options.requestedLimit})`}`,
    "",
  ]

  for (const [index, row] of rows.entries()) {
    const title = (row.title ?? "Mention").replace(/\s+/g, " ").trim().slice(0, 120)
    lines.push(`${index + 1}. [${platformLabel(row.platform)}] ${title}`)
    lines.push(`Keyword: ${row.matched_query} · ${formatTimestamp(row.published_at)}`)
    lines.push(row.url)
    lines.push("")
  }

  return lines.join("\n").slice(0, 3900)
}

function parseCommand(text: string) {
  const trimmed = text.trim()
  const [rawCommand, ...rest] = trimmed.split(/\s+/)
  const command = rawCommand.toLowerCase().split("@")[0]
  return {
    command,
    args: rest,
    rawArgs: trimmed.slice(rawCommand.length).trim(),
  }
}

function splitValueAndLimit(raw: string): { value: string; limit: number } {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error("Provide a value.")
  }

  const parts = trimmed.split(/\s+/)
  const maybeLimit = parts.at(-1)
  if (maybeLimit && /^\d+$/.test(maybeLimit)) {
    return {
      value: trimmed.slice(0, trimmed.length - maybeLimit.length).trim(),
      limit: parseTelegramLimit(maybeLimit),
    }
  }

  return {
    value: trimmed,
    limit: 20,
  }
}

async function reply(chatId: number, text: string) {
  await sendTelegramMessage(chatId, text)
}

export async function POST(request: NextRequest) {
  try {
    if (!hasServiceTelegramConfig()) {
      return NextResponse.json({ ok: true })
    }

    const expectedSecret = getTelegramWebhookSecret()
    if (expectedSecret) {
      const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token")
      if (receivedSecret !== expectedSecret) {
        return NextResponse.json({ ok: false }, { status: 401 })
      }
    }

    const update = (await request.json().catch(() => null)) as TelegramUpdate | null
    const message = update?.message
    const chatId = message?.chat?.id
    const text = message?.text?.trim()
    if (!chatId || !text) {
      return NextResponse.json({ ok: true })
    }

    const { command, rawArgs, args } = parseCommand(text)

    if (command === "/start") {
      const token = args[0]?.trim()
      if (!token) {
        await reply(chatId, "Open Signalze settings, tap connect, and send the /start code shown there.")
        return NextResponse.json({ ok: true })
      }

      const subscription = await getSubscriptionByLinkToken(token)
      if (!subscription) {
        await reply(chatId, "That start code is invalid. Generate a fresh code from Signalze settings and try again.")
        return NextResponse.json({ ok: true })
      }

      const expiresAt = new Date(subscription.link_token_expires_at).getTime()
      if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
        await reply(chatId, "That start code has expired. Generate a new one from Signalze settings.")
        return NextResponse.json({ ok: true })
      }

      const linkedSubscription = await updateSubscription(subscription.user_id, {
        chat_id: chatId,
        connected_at: new Date().toISOString(),
        alerts_enabled: true,
        paused_at: null,
        last_error: null,
        last_error_at: null,
        link_token: crypto.randomUUID(),
        link_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      await reply(chatId, `Telegram is connected.\n\n${buildHelpText(linkedSubscription ?? subscription)}`)
      return NextResponse.json({ ok: true })
    }

    const subscription = await getSubscriptionByChatId(chatId)
    if (!subscription) {
      await reply(chatId, "This chat is not linked to a Signalze account yet. Generate a connect code in settings and send /start <code>.")
      return NextResponse.json({ ok: true })
    }

    const profile = await getProfile(subscription.user_id)
    if (!profile) {
      await reply(chatId, "I couldn’t find your Signalze account. Reconnect from settings.")
      return NextResponse.json({ ok: true })
    }

    try {
      ensureActiveEntitlement(profile)
    } catch {
      await reply(chatId, "Your Signalze plan or trial is inactive. Renew in Signalze to use Telegram mentions.")
      return NextResponse.json({ ok: true })
    }

    const trackedKeywords = await listActiveKeywords(subscription.user_id)
    try {
      if (command === "/help") {
        await reply(chatId, buildHelpText(subscription))
        return NextResponse.json({ ok: true })
      }

      if (command === "/pause" || command === "/stop") {
        await updateSubscription(subscription.user_id, {
          alerts_enabled: false,
          paused_at: new Date().toISOString(),
        })
        await reply(chatId, "Telegram alerts are paused. You can still use /latest, /keyword, and /platform anytime.")
        return NextResponse.json({ ok: true })
      }

      if (command === "/resume") {
        await updateSubscription(subscription.user_id, {
          alerts_enabled: true,
          paused_at: null,
        })
        await reply(chatId, "Telegram alerts are active again.")
        return NextResponse.json({ ok: true })
      }

      if (command === "/filters") {
        await reply(chatId, buildHelpText(subscription))
        return NextResponse.json({ ok: true })
      }

      if (command === "/setkeyword") {
        const value = rawArgs.trim()
        if (!value) {
          await reply(chatId, "Use /setkeyword <tracked keyword|all>.")
          return NextResponse.json({ ok: true })
        }

        if (value.toLowerCase() === "all") {
          await updateSubscription(subscription.user_id, { keyword_filter: null })
          await reply(chatId, "Saved keyword filter cleared.")
          return NextResponse.json({ ok: true })
        }

        const keyword = normalizeKeywordAgainstTracked(value, trackedKeywords)
        await updateSubscription(subscription.user_id, { keyword_filter: keyword })
        await reply(chatId, `Saved keyword filter set to ${keyword}.`)
        return NextResponse.json({ ok: true })
      }

      if (command === "/setplatform") {
        const value = rawArgs.trim()
        if (!value) {
          await reply(chatId, "Use /setplatform <hackernews|devto|github_discussions|all>.")
          return NextResponse.json({ ok: true })
        }

        if (value.toLowerCase() === "all") {
          await updateSubscription(subscription.user_id, { platform_filter: null })
          await reply(chatId, "Saved platform filter cleared.")
          return NextResponse.json({ ok: true })
        }

        const platform = parseTelegramPlatform(value)
        await updateSubscription(subscription.user_id, { platform_filter: platform })
        await reply(chatId, `Saved platform filter set to ${platformLabel(platform)}.`)
        return NextResponse.json({ ok: true })
      }

      if (command === "/latest") {
        const limit = parseTelegramLimit(args[0] ?? null)
        const rows = await fetchTelegramMentions(subscription.user_id, {
          limit,
          keyword: subscription.keyword_filter,
          platform: subscription.platform_filter,
        })
        await reply(
          chatId,
          buildMentionsMessage(rows, {
            requestedLimit: limit,
            keyword: subscription.keyword_filter,
            platform: subscription.platform_filter,
          }),
        )
        return NextResponse.json({ ok: true })
      }

      if (command === "/keyword") {
        const { value, limit } = splitValueAndLimit(rawArgs)
        const keyword = normalizeKeywordAgainstTracked(value, trackedKeywords)
        const rows = await fetchTelegramMentions(subscription.user_id, {
          limit,
          keyword,
          platform: subscription.platform_filter,
        })
        await reply(
          chatId,
          buildMentionsMessage(rows, {
            requestedLimit: limit,
            keyword,
            platform: subscription.platform_filter,
          }),
        )
        return NextResponse.json({ ok: true })
      }

      if (command === "/platform") {
        const { value, limit } = splitValueAndLimit(rawArgs)
        const platform = parseTelegramPlatform(value)
        const rows = await fetchTelegramMentions(subscription.user_id, {
          limit,
          keyword: subscription.keyword_filter,
          platform,
        })
        await reply(
          chatId,
          buildMentionsMessage(rows, {
            requestedLimit: limit,
            keyword: subscription.keyword_filter,
            platform,
          }),
        )
        return NextResponse.json({ ok: true })
      }
    } catch (commandError) {
      const message =
        commandError instanceof Error && commandError.message.trim()
          ? commandError.message
          : "I couldn’t process that command. Use /help to see the supported commands."
      await reply(chatId, message)
      return NextResponse.json({ ok: true })
    }

    await reply(chatId, buildHelpText(subscription))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return toErrorResponse("api/integrations/telegram/webhook", error, "Unable to process Telegram webhook.")
  }
}
