import { NextRequest, NextResponse } from "next/server"

import { resolveSignalzeHomeUrl, toErrorResponse } from "@/lib/server/errors"
import { serviceRestRequest } from "@/lib/server/supabase"
import {
  getTelegramWebhookSecret,
  normalizeTelegramKeyword,
  parseTelegramLimit,
  parseTelegramPlatform,
  sendTelegramMessage,
  type TelegramPendingAction,
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

function isMissingPendingActionColumn(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("pending_action")
}

async function getSubscriptionByChatId(chatId: number): Promise<TelegramSubscriptionRow | null> {
  const basePath = `/telegram_subscriptions?chat_id=eq.${encodeURIComponent(
    String(chatId),
  )}&select=user_id,chat_id,alerts_enabled,keyword_filter,platform_filter,link_token,link_token_expires_at,connected_at,paused_at,last_alert_sent_at,last_delivered_match_at,last_error,last_error_at&limit=1`

  try {
    const rows = await serviceRestRequest<TelegramSubscriptionRow[]>(
      basePath.replace("platform_filter,", "platform_filter,pending_action,"),
    )
    return rows[0] ?? null
  } catch (error) {
    if (!isMissingPendingActionColumn(error)) {
      throw error
    }
    const rows = await serviceRestRequest<Array<Omit<TelegramSubscriptionRow, "pending_action">>>(basePath)
    return rows[0] ? { ...rows[0], pending_action: null } : null
  }
}

async function getSubscriptionByLinkToken(token: string): Promise<TelegramSubscriptionRow | null> {
  const basePath = `/telegram_subscriptions?link_token=eq.${encodeURIComponent(
    token,
  )}&select=user_id,chat_id,alerts_enabled,keyword_filter,platform_filter,link_token,link_token_expires_at,connected_at,paused_at,last_alert_sent_at,last_delivered_match_at,last_error,last_error_at&limit=1`

  try {
    const rows = await serviceRestRequest<TelegramSubscriptionRow[]>(
      basePath.replace("platform_filter,", "platform_filter,pending_action,"),
    )
    return rows[0] ?? null
  } catch (error) {
    if (!isMissingPendingActionColumn(error)) {
      throw error
    }
    const rows = await serviceRestRequest<Array<Omit<TelegramSubscriptionRow, "pending_action">>>(basePath)
    return rows[0] ? { ...rows[0], pending_action: null } : null
  }
}

async function updateSubscription(userId: string, patch: Record<string, unknown>): Promise<TelegramSubscriptionRow | null> {
  const path = `/telegram_subscriptions?user_id=eq.${encodeURIComponent(userId)}`
  try {
    const rows = await serviceRestRequest<TelegramSubscriptionRow[]>(
      path,
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
    const rows = await serviceRestRequest<Array<Omit<TelegramSubscriptionRow, "pending_action">>>(
      path,
      {
        method: "PATCH",
        body: JSON.stringify(fallbackPatch),
      },
    )
    return rows[0] ? { ...rows[0], pending_action: null } : null
  }
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
  const alertsState = subscription?.alerts_enabled === false ? "paused" : "active"
  const alertCommand = subscription?.alerts_enabled === false ? "/resume - resume Telegram alerts" : "/pause - stop Telegram alerts"

  return [
    "Signalze Telegram commands",
    "",
    `/latest - show the latest 20 mentions`,
    `/latest 50 - show more (max 100)`,
    `/keyword - choose a keyword and see mentions`,
    `/platform - choose a platform and see mentions`,
    alertCommand,
    `/stop - alias for /pause`,
    "",
    `Alerts: ${alertsState}`,
  ].join("\n")
}

async function clearPendingAction(userId: string) {
  await updateSubscription(userId, { pending_action: null })
}

async function setPendingAction(userId: string, action: TelegramPendingAction) {
  await updateSubscription(userId, { pending_action: action })
}

async function handlePendingAction(
  chatId: number,
  subscription: TelegramSubscriptionRow,
  trackedKeywords: string[],
  rawText: string,
): Promise<boolean> {
  const pendingAction = subscription.pending_action
  if (!pendingAction) {
    return false
  }

  if (!rawText.trim()) {
    await clearPendingAction(subscription.user_id)
    await reply(chatId, "That reply was empty. Start again with /keyword or /platform.")
    return true
  }

  if (pendingAction === "keyword_query") {
    const { value, limit } = splitValueAndLimit(rawText)
    const keyword = normalizeKeywordAgainstTracked(value, trackedKeywords)
    const rows = await fetchTelegramMentions(subscription.user_id, {
      limit,
      keyword,
      platform: subscription.platform_filter,
    })
    await clearPendingAction(subscription.user_id)
    await reply(
      chatId,
      buildMentionsMessage(rows, {
        requestedLimit: limit,
        keyword,
        platform: subscription.platform_filter,
      }),
    )
    return true
  }

  if (pendingAction === "platform_query") {
    const { value, limit } = splitValueAndLimit(rawText)
    const platform = parseTelegramPlatform(value)
    const rows = await fetchTelegramMentions(subscription.user_id, {
      limit,
      keyword: subscription.keyword_filter,
      platform,
    })
    await clearPendingAction(subscription.user_id)
    await reply(
      chatId,
      buildMentionsMessage(rows, {
        requestedLimit: limit,
        keyword: subscription.keyword_filter,
        platform,
      }),
    )
    return true
  }

  return false
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

function extractStartToken(text: string): string | null {
  const match = text.match(/(?:^|\s)\/start(?:@\w+)?\s+([^\s]+)/i)
  const token = match?.[1]?.trim()
  return token ? token : null
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

async function restartConnection(chatId: number, token: string) {
  const subscription = await getSubscriptionByLinkToken(token)
  if (!subscription) {
    await reply(chatId, "That start code is invalid. Generate a fresh code from Signalze settings and try again.")
    return
  }

  const expiresAt = new Date(subscription.link_token_expires_at).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    await reply(chatId, "That start code has expired. Generate a new one from Signalze settings.")
    return
  }

  try {
    const linkedSubscription = await updateSubscription(subscription.user_id, {
      chat_id: chatId,
      connected_at: new Date().toISOString(),
      alerts_enabled: true,
      paused_at: null,
      pending_action: null,
      last_error: null,
      last_error_at: null,
      link_token: crypto.randomUUID(),
      link_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    await reply(chatId, `Telegram is connected.\n\n${buildHelpText(linkedSubscription ?? subscription)}`)
  } catch {
    await reply(
      chatId,
      "I couldn’t complete that connection yet. Generate a fresh Telegram code in Signalze settings, then paste the new /start code here and I’ll try again.",
    )
  }
}

export async function POST(request: NextRequest) {
  let chatId: number | null = null
  let text: string | null = null
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
    chatId = message?.chat?.id ?? null
    text = message?.text?.trim() ?? null
    if (!chatId || !text) {
      return NextResponse.json({ ok: true })
    }

    const { command, rawArgs, args } = parseCommand(text)
    const startToken = command === "/start" ? args[0]?.trim() ?? null : extractStartToken(text)

    if (startToken) {
      await restartConnection(chatId, startToken)
      return NextResponse.json({ ok: true })
    }

    if (command === "/start") {
      if (!rawArgs.trim()) {
        await reply(chatId, "Open Signalze settings, tap connect, and send the /start code shown there.")
        return NextResponse.json({ ok: true })
      }
      await reply(chatId, "Paste the full /start code from Signalze settings and I’ll retry the connection.")
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
      await reply(
        chatId,
        `Your Signalze plan or trial is inactive. Please subscribe for more at ${resolveSignalzeHomeUrl()}.`,
      )
      return NextResponse.json({ ok: true })
    }

    const trackedKeywords = await listActiveKeywords(subscription.user_id)
    try {
      if (!command.startsWith("/") && subscription.pending_action) {
        await handlePendingAction(chatId, subscription, trackedKeywords, text)
        return NextResponse.json({ ok: true })
      }

      if (command === "/pause" || command === "/stop") {
        await updateSubscription(subscription.user_id, {
          alerts_enabled: false,
          paused_at: new Date().toISOString(),
          pending_action: null,
        })
        await reply(chatId, "Telegram alerts are paused. You can still use /latest, /keyword, and /platform anytime.")
        return NextResponse.json({ ok: true })
      }

      if (command === "/resume") {
        await updateSubscription(subscription.user_id, {
          alerts_enabled: true,
          paused_at: null,
          pending_action: null,
        })
        await reply(chatId, "Telegram alerts are active again.")
        return NextResponse.json({ ok: true })
      }

      if (command === "/filters") {
        await clearPendingAction(subscription.user_id)
        await reply(chatId, "Use /keyword or /platform to browse mentions, or /latest for the newest results.")
        return NextResponse.json({ ok: true })
      }

      if (command === "/latest") {
        await clearPendingAction(subscription.user_id)
        const limit = parseTelegramLimit(args[0] ?? null)
        const rows = await fetchTelegramMentions(subscription.user_id, {
          limit,
          keyword: null,
          platform: null,
        })
        await reply(
          chatId,
          buildMentionsMessage(rows, {
            requestedLimit: limit,
            keyword: null,
            platform: null,
          }),
        )
        return NextResponse.json({ ok: true })
      }

      if (command === "/keyword") {
        if (!rawArgs.trim()) {
          await setPendingAction(subscription.user_id, "keyword_query")
          await reply(chatId, `Which keyword do you want to search?\nAvailable: ${trackedKeywords.join(", ") || "none"}`)
          return NextResponse.json({ ok: true })
        }

        const { value, limit } = splitValueAndLimit(rawArgs)
        const keyword = normalizeKeywordAgainstTracked(value, trackedKeywords)
        const rows = await fetchTelegramMentions(subscription.user_id, {
          limit,
          keyword,
          platform: null,
        })
        await clearPendingAction(subscription.user_id)
        await reply(
          chatId,
          buildMentionsMessage(rows, {
            requestedLimit: limit,
            keyword,
            platform: null,
          }),
        )
        return NextResponse.json({ ok: true })
      }

      if (command === "/platform") {
        if (!rawArgs.trim()) {
          await setPendingAction(subscription.user_id, "platform_query")
          await reply(chatId, "Which platform do you want to search?\nAvailable: hackernews, devto, or github_discussions.")
          return NextResponse.json({ ok: true })
        }

        const { value, limit } = splitValueAndLimit(rawArgs)
        const platform = parseTelegramPlatform(value)
        const rows = await fetchTelegramMentions(subscription.user_id, {
          limit,
          keyword: null,
          platform,
        })
        await clearPendingAction(subscription.user_id)
        await reply(
          chatId,
          buildMentionsMessage(rows, {
            requestedLimit: limit,
            keyword: null,
            platform,
          }),
        )
        return NextResponse.json({ ok: true })
      }
    } catch (commandError) {
      const message =
        commandError instanceof Error && commandError.message.trim()
          ? commandError.message
          : "I couldn’t process that command."
      await reply(chatId, message)
      return NextResponse.json({ ok: true })
    }

    await reply(chatId, buildHelpText(subscription))
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (chatId) {
      const normalizedText = text?.trim().toLowerCase() ?? ""
      const fallbackMessage = normalizedText.startsWith("/start")
        ? "I couldn’t complete that connection. Generate a fresh Telegram code in Signalze settings and send the new /start code again."
        : "I couldn’t process that just now. Try again, or use /latest, /keyword, /platform, /pause, or /stop."
      try {
        await reply(chatId, fallbackMessage)
      } catch (replyError) {
        console.error("[api/integrations/telegram/webhook:fallback-reply]", replyError)
      }
    }
    return toErrorResponse("api/integrations/telegram/webhook", error, "Unable to process Telegram webhook.")
  }
}
