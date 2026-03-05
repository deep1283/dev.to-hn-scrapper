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
  termCount?: number
  reason: "onboarding_completed" | "keyword_activated"
}

function cleanEnv(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
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
  console.info("[mentions-bootstrap] Seeded mentions from cache.", {
    userId,
    insertedMatches: inserted,
    nudgedSources: nudged,
  })
}

async function triggerRunNowWebhook(params: BootstrapParams): Promise<boolean> {
  const webhookUrl = cleanEnv(process.env.MENTION_BOOTSTRAP_WEBHOOK_URL)
  if (!webhookUrl) {
    return false
  }

  const webhookToken = cleanEnv(process.env.MENTION_BOOTSTRAP_WEBHOOK_TOKEN)
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
        reason: params.reason,
        userId: params.userId,
        terms: params.termCount ?? null,
        requestedAt: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      const details = await response.text().catch(() => "")
      throw new Error(`Webhook returned ${response.status}${details ? `: ${details.slice(0, 240)}` : ""}`)
    }

    console.info("[mentions-bootstrap] Triggered run-now webhook.", {
      userId: params.userId,
      reason: params.reason,
      status: response.status,
    })
    return true
  } finally {
    clearTimeout(timer)
  }
}

async function triggerGitHubWorkflowDispatch(params: BootstrapParams): Promise<boolean> {
  const token = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_TOKEN)
  const owner = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_OWNER)
  const repo = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_REPO)
  const workflow = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_WORKFLOW)

  if (!token || !owner || !repo || !workflow) {
    return false
  }

  const ref = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_REF) ?? "main"
  const apiBase = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_API_BASE_URL) ?? "https://api.github.com"
  const url = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo,
  )}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        reason: params.reason,
        user_id: params.userId,
        terms: String(params.termCount ?? ""),
        requested_at: new Date().toISOString(),
      },
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(
      `GitHub workflow dispatch failed (${response.status})${details ? `: ${details.slice(0, 240)}` : ""}`,
    )
  }

  console.info("[mentions-bootstrap] Triggered GitHub workflow dispatch.", {
    owner,
    repo,
    workflow,
    ref,
    reason: params.reason,
    userId: params.userId,
  })
  return true
}

async function bootstrapMentions(params: BootstrapParams): Promise<void> {
  try {
    await seedMatchesFromRecentMentions(params.accessToken, params.userId)
  } catch (error) {
    console.warn("[mentions-bootstrap] Cache bootstrap failed; continuing without blocking request.", {
      userId: params.userId,
      reason: params.reason,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    const webhookTriggered = await triggerRunNowWebhook(params)
    if (!webhookTriggered) {
      const githubTriggered = await triggerGitHubWorkflowDispatch(params)
      if (!githubTriggered) {
        console.info("[mentions-bootstrap] No run-now trigger configured; waiting for scheduled worker run.", {
          userId: params.userId,
          reason: params.reason,
        })
      }
    }
  } catch (error) {
    console.warn("[mentions-bootstrap] Run-now trigger failed; worker cron will still pick up due tasks.", {
      userId: params.userId,
      reason: params.reason,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function bootstrapMentionsAfterOnboarding(params: Omit<BootstrapParams, "reason">): Promise<void> {
  await bootstrapMentions({
    ...params,
    reason: "onboarding_completed",
  })
}

export async function bootstrapMentionsAfterKeywordActivation(params: Omit<BootstrapParams, "reason" | "termCount">): Promise<void> {
  await bootstrapMentions({
    ...params,
    reason: "keyword_activated",
  })
}
