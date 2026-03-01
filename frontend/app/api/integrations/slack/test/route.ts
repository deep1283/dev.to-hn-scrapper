import { NextRequest, NextResponse } from "next/server"

import { requireEntitledAuth } from "@/lib/server/authz"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { restRequest } from "@/lib/server/supabase"
import { withSessionCookie } from "@/lib/server/session"
import { ensureProPlan } from "@/lib/server/validation"

type SlackProfileRow = {
  slack_webhook_url_enc: string | null
}

function buildSlackTestPayload() {
  const now = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date())

  return {
    text: "Signalze test alert",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Signalze test alert",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Slack updates are connected for your Pro plan. Test sent at ${now}.`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "You will now receive mention alerts here.",
          },
        ],
      },
    ],
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireEntitledAuth(request)
    ensureProPlan(auth.profile)

    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`integrations:slack:test:${auth.userId}:${ip}`, 12, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const rows = await restRequest<SlackProfileRow[]>(
      `/profiles?id=eq.${encodeURIComponent(auth.userId)}&select=slack_webhook_url_enc`,
      auth.accessToken,
    )
    const webhookUrl = rows[0]?.slack_webhook_url_enc?.trim()
    if (!webhookUrl) {
      throw badRequest("Connect Slack first, then send a test alert.")
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6_000)

    let slackResponse: Response
    try {
      slackResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildSlackTestPayload()),
        cache: "no-store",
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!slackResponse.ok) {
      throw badRequest("Slack rejected the webhook. Check your webhook URL and try again.")
    }

    const response = NextResponse.json({
      ok: true,
      message: "Test alert sent to Slack.",
    })
    return withSessionCookie(response, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/integrations/slack/test", error, "Unable to send Slack test alert.")
  }
}
