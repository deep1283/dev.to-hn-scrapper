import { ACTIVE_PLATFORMS } from "@/lib/platforms"
import { restRequest } from "@/lib/server/supabase"

const DEFAULT_WEBHOOK_TIMEOUT_MS = 4_000
const MIN_WEBHOOK_TIMEOUT_MS = 1_000
const MAX_WEBHOOK_TIMEOUT_MS = 15_000

type BootstrapMentionsResult = {
  inserted_matches?: number
  nudged_sources?: number
}

type BootstrapParams = {
  accessToken: string
  userId: string
  brandCount: number
  keywordCount: number
}

function resolveWebhookTimeoutMs(): number {
  const raw = Number(process.env.MENTION_BOOTSTRAP_WEBHOOK_TIMEOUT_MS ?? DEFAULT_WEBHOOK_TIMEOUT_MS)
  if (!Number.isFinite(raw)) {
    return DEFAULT_WEBHOOK_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.round(raw), MIN_WEBHOOK_TIMEOUT_MS), MAX_WEBHOOK_TIMEOUT_MS)
}

async function seedMatchesFromRecentMentions(accessToken: string, userId: string): Promise<void> {
  const payload = await restRequest<BootstrapMentionsResult>(`/rpc/bootstrap_mentions_for_user`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_sources: [...ACTIVE_PLATFORMS],
      p_history_days: 7,
    }),
  })

  const inserted = Number(payload.inserted_matches ?? 0)
  const nudged = Number(payload.nudged_sources ?? 0)
  console.info("[mentions-bootstrap] Seeded onboarding mentions from cache.", {
    userId,
    insertedMatches: inserted,
    nudgedSources: nudged,
  })
}

async function triggerRunNowWebhook(params: BootstrapParams): Promise<void> {
  const webhookUrl = process.env.MENTION_BOOTSTRAP_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    return
  }

  const webhookToken = process.env.MENTION_BOOTSTRAP_WEBHOOK_TOKEN?.trim()
  const timeoutMs = resolveWebhookTimeoutMs()
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      cache: "no-store",
      signal: abortController.signal,
      headers: {
        "Content-Type": "application/json",
        ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
      },
      body: JSON.stringify({
        reason: "onboarding_completed",
        userId: params.userId,
        brands: params.brandCount,
        keywords: params.keywordCount,
        requestedAt: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      const details = await response.text().catch(() => "")
      throw new Error(`Webhook returned ${response.status}${details ? `: ${details.slice(0, 240)}` : ""}`)
    }

    console.info("[mentions-bootstrap] Triggered run-now webhook after onboarding completion.", {
      userId: params.userId,
      status: response.status,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function bootstrapMentionsAfterOnboarding(params: BootstrapParams): Promise<void> {
  try {
    await seedMatchesFromRecentMentions(params.accessToken, params.userId)
  } catch (error) {
    console.warn("[mentions-bootstrap] Cache bootstrap failed; continuing without blocking onboarding.", {
      userId: params.userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    await triggerRunNowWebhook(params)
  } catch (error) {
    console.warn("[mentions-bootstrap] Run-now webhook failed; worker cron will still pick up due tasks.", {
      userId: params.userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
