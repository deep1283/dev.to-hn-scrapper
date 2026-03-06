import { NextRequest, NextResponse } from "next/server"

import { AppError, toErrorResponse, tooManyRequests, unauthorized } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"

export const dynamic = "force-dynamic"

const CRON_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const
const DEFAULT_REASON = "external_cron_tick"

type CronDispatchBody = {
  reason?: unknown
}

function cleanEnv(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function cleanInput(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null
  }
  const [scheme, token] = authorizationHeader.split(/\s+/, 2)
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null
  }
  return token.trim() || null
}

function resolveCronToken(): string {
  const token = cleanEnv(process.env.CRON_MENTIONS_TOKEN) ?? cleanEnv(process.env.MENTION_BOOTSTRAP_WEBHOOK_TOKEN)
  if (!token) {
    throw new AppError(500, "Cron trigger is not configured.", "Missing CRON_MENTIONS_TOKEN or MENTION_BOOTSTRAP_WEBHOOK_TOKEN.")
  }
  return token
}

function resolveGitHubDispatchConfig() {
  const token = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_TOKEN)
  const owner = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_OWNER)
  const repo = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_REPO)
  const workflow = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_WORKFLOW)
  const ref = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_REF) ?? "main"
  const apiBase = cleanEnv(process.env.MENTION_BOOTSTRAP_GITHUB_API_BASE_URL) ?? "https://api.github.com"

  if (!token || !owner || !repo || !workflow) {
    throw new AppError(
      500,
      "Worker dispatch is not configured.",
      "Missing one or more env vars: MENTION_BOOTSTRAP_GITHUB_TOKEN/OWNER/REPO/WORKFLOW.",
    )
  }

  return { token, owner, repo, workflow, ref, apiBase }
}

async function resolveReason(request: NextRequest): Promise<string> {
  const fromQuery = cleanInput(request.nextUrl.searchParams.get("reason"))
  if (fromQuery) {
    return fromQuery
  }

  if (request.method !== "POST") {
    return DEFAULT_REASON
  }

  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/json")) {
    return DEFAULT_REASON
  }

  const payload = (await request.json().catch(() => ({}))) as CronDispatchBody
  if (typeof payload.reason === "string" && payload.reason.trim()) {
    return payload.reason.trim()
  }
  return DEFAULT_REASON
}

function assertAuthorized(request: NextRequest, expectedToken: string) {
  const fromBearer = extractBearerToken(request.headers.get("authorization"))
  const fromHeader = cleanInput(request.headers.get("x-cron-token"))
  const fromQuery = cleanInput(request.nextUrl.searchParams.get("token"))
  const provided = fromBearer ?? fromHeader ?? fromQuery
  if (!provided || provided !== expectedToken) {
    throw unauthorized("Invalid cron token.")
  }
}

async function dispatchWorkerRun(request: NextRequest) {
  const ip = getRequestIp(request)
  const rate = await takeRateLimit(`cron:mentions:${ip}`, CRON_RATE_LIMIT.limit, CRON_RATE_LIMIT.windowMs)
  if (!rate.allowed) {
    throw tooManyRequests("Too many cron trigger attempts. Please retry shortly.")
  }

  const cronToken = resolveCronToken()
  assertAuthorized(request, cronToken)

  const reason = await resolveReason(request)
  const requestedAt = new Date().toISOString()
  const config = resolveGitHubDispatchConfig()

  const dispatchUrl = `${config.apiBase}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(
    config.repo,
  )}/actions/workflows/${encodeURIComponent(config.workflow)}/dispatches`

  const response = await fetch(dispatchUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: config.ref,
      inputs: {
        reason,
        requested_at: requestedAt,
      },
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new AppError(
      502,
      "Unable to dispatch worker run.",
      `GitHub workflow dispatch failed (${response.status})${details ? `: ${details.slice(0, 240)}` : ""}`,
    )
  }

  return NextResponse.json({
    ok: true,
    dispatched: true,
    workflow: config.workflow,
    repository: `${config.owner}/${config.repo}`,
    ref: config.ref,
    reason,
    requestedAt,
  })
}

export async function GET(request: NextRequest) {
  try {
    return await dispatchWorkerRun(request)
  } catch (error) {
    return toErrorResponse("api/cron/mentions:get", error, "Unable to trigger worker run.")
  }
}

export async function POST(request: NextRequest) {
  try {
    return await dispatchWorkerRun(request)
  } catch (error) {
    return toErrorResponse("api/cron/mentions:post", error, "Unable to trigger worker run.")
  }
}
