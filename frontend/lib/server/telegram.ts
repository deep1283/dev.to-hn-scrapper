import { AppError, badRequest } from "@/lib/server/errors"
import { normalizeInput } from "@/lib/server/validation"

export type TelegramPlatform = "hackernews" | "devto" | "github_discussions"

export type TelegramSubscriptionRow = {
  user_id: string
  chat_id: number | null
  alerts_enabled: boolean
  keyword_filter: string | null
  platform_filter: TelegramPlatform | null
  link_token: string
  link_token_expires_at: string
  connected_at: string | null
  paused_at: string | null
  last_alert_sent_at: string | null
  last_delivered_match_at: string | null
  last_error: string | null
  last_error_at: string | null
}

type TelegramApiEnvelope<T> = {
  ok: boolean
  result?: T
  description?: string
}

type TelegramBotInfo = {
  id: number
  username?: string
  first_name?: string
}

function getToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  return token ? token : null
}

export function getTelegramWebhookSecret(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  return secret ? secret : null
}

export function telegramConfigured(): boolean {
  return Boolean(getToken())
}

export async function getTelegramBotInfo(): Promise<TelegramBotInfo | null> {
  const token = getToken()
  if (!token) {
    return null
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    method: "GET",
    cache: "no-store",
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json().catch(() => null)) as TelegramApiEnvelope<TelegramBotInfo> | null
  if (!payload?.ok || !payload.result) {
    return null
  }

  return payload.result
}

export function buildTelegramBotLink(botUsername: string | null | undefined, startToken: string): string | null {
  if (!botUsername) {
    return null
  }

  return `https://t.me/${botUsername}?start=${encodeURIComponent(startToken)}`
}

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  const token = getToken()
  if (!token) {
    throw new AppError(500, "Telegram is not configured.", "Missing TELEGRAM_BOT_TOKEN.")
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as TelegramApiEnvelope<Record<string, unknown>> | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description ?? `Telegram send failed (${response.status})`)
  }
}

export function parseTelegramLimit(value: string | undefined | null): number {
  if (!value) {
    return 20
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw badRequest("Use a positive number up to 100.")
  }

  return Math.min(parsed, 100)
}

export function normalizeTelegramKeyword(value: string): string {
  const normalized = normalizeInput(value).slice(0, 120)
  if (normalized.length < 2) {
    throw badRequest("Enter a tracked keyword with at least 2 characters.")
  }
  return normalized
}

export function parseTelegramPlatform(value: string): TelegramPlatform {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    throw badRequest("Choose a valid platform.")
  }

  if (normalized === "hn" || normalized === "hackernews" || normalized === "hacker-news") {
    return "hackernews"
  }
  if (normalized === "devto" || normalized === "dev.to") {
    return "devto"
  }
  if (normalized === "github" || normalized === "github_discussions" || normalized === "github-discussions") {
    return "github_discussions"
  }

  throw badRequest("Choose hackernews, devto, or github_discussions.")
}
