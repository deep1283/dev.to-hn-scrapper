import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { patchProfile, restRequest } from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"
import { ensureProPlan, parseSlackWebhookUrl } from "@/lib/server/validation"

type SlackProfileRow = {
  slack_webhook_url_enc: string | null
}

type ConnectSlackBody = {
  webhookUrl?: unknown
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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`integrations:slack:status:${auth.userId}:${ip}`, 60, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const webhookUrl = await getSlackWebhook(auth.accessToken, auth.userId)

    const response = NextResponse.json({
      connected: Boolean(webhookUrl),
      webhookHint: toWebhookHint(webhookUrl),
      canUseSlack: auth.profile.plan_tier === "growth_15",
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/integrations/slack:get", error, "Unable to load Slack integration.")
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    ensureProPlan(auth.profile)

    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`integrations:slack:connect:${auth.userId}:${ip}`, 20, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<ConnectSlackBody>(request)
    const webhookUrl = parseSlackWebhookUrl(body.webhookUrl)

    await patchProfile(auth.accessToken, auth.userId, {
      slack_webhook_url_enc: webhookUrl,
    })

    const response = NextResponse.json({
      connected: true,
      webhookHint: toWebhookHint(webhookUrl),
      message: "Slack updates connected.",
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/integrations/slack:post", error, "Unable to connect Slack updates.")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)

    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`integrations:slack:disconnect:${auth.userId}:${ip}`, 20, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    await patchProfile(auth.accessToken, auth.userId, {
      slack_webhook_url_enc: null,
    })

    const response = NextResponse.json({
      connected: false,
      webhookHint: null,
      message: "Slack updates disconnected.",
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/integrations/slack:delete", error, "Unable to disconnect Slack updates.")
  }
}

export async function PUT(request: NextRequest) {
  return POST(request)
}

export async function PATCH() {
  throw badRequest("Use POST to connect Slack updates.")
}
