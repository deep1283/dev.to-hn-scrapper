import type { PlanTier, ProfileRow } from "@/lib/server/supabase"

type ResendEmailPayload = {
  to: string
  subject: string
  html: string
  text: string
  eventId: string
}

type PaymentGreetingPayload = {
  email: string | null | undefined
  planTier: PlanTier
  eventId: string
}

type PilotRequestNotificationPayload = {
  requestId: string
  createdAt: string
  name: string
  email: string
  appUrl: string
  testingScope: string
}

const WELCOME_WINDOW_MS = 15 * 60_000

function getEmailEnv() {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.signalze.com").replace(/\/+$/, "")
  const audience = process.env.RESEND_AUDIENCE_ID
  const pilotNotificationTo = process.env.RESEND_PILOT_REQUEST_TO_EMAIL ?? "deepmishra1283@gmail.com"

  if (!apiKey || !from) {
    return null
  }

  return {
    apiKey,
    from,
    appUrl,
    audience,
    pilotNotificationTo,
  }
}

function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  }
}

async function reserveEmailEvent(eventId: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return true
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/webhook_events?on_conflict=provider,event_id`, {
    method: "POST",
    headers: {
      ...serviceHeaders(serviceRoleKey),
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify([{ provider: "resend_email", event_id: eventId }]),
    cache: "no-store",
  })

  if (response.status === 404) {
    return true
  }

  if (!response.ok) {
    throw new Error(`Email idempotency insert failed (${response.status})`)
  }

  const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>
  return rows.length > 0
}

async function sendEmail(payload: ResendEmailPayload) {
  const env = getEmailEnv()
  if (!env) {
    console.warn("[email] Resend is not configured. Skipping email send.", { eventId: payload.eventId })
    return
  }

  const reserved = await reserveEmailEvent(payload.eventId)
  if (!reserved) {
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": payload.eventId,
    },
    body: JSON.stringify({
      from: env.from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    const details = await response.text().catch(() => "")
    throw new Error(`Resend email failed (${response.status}) ${details}`.trim())
  }

  if (env.audience) {
    const contactResponse = await fetch(`https://api.resend.com/audiences/${env.audience}/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: payload.to,
        unsubscribed: false,
      }),
      cache: "no-store",
    }).catch(() => null)

    if (contactResponse && !contactResponse.ok && contactResponse.status !== 409) {
      console.warn("[email] Unable to upsert Resend audience contact.", { status: contactResponse.status })
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function planLabel(planTier: PlanTier): string {
  return planTier === "growth_15" ? "$9 Growth" : "$5 Starter"
}

function isNewlyCreatedProfile(profile: Pick<ProfileRow, "created_at">): boolean {
  if (!profile.created_at) {
    return false
  }
  const createdAt = new Date(profile.created_at).getTime()
  if (!Number.isFinite(createdAt)) {
    return false
  }
  return Date.now() - createdAt <= WELCOME_WINDOW_MS
}

export async function sendWelcomeEmailIfEligible(profile: Pick<ProfileRow, "id" | "email" | "created_at">) {
  const to = profile.email?.trim().toLowerCase()
  if (!to || !isNewlyCreatedProfile(profile)) {
    return
  }

  const env = getEmailEnv()
  const dashboardUrl = `${env?.appUrl ?? "https://www.signalze.com"}/dashboard`
  const subject = "Welcome to Signalze"
  const html = `
    <div style="font-family: Georgia, serif; color: #1f1f19; line-height: 1.6;">
      <h1 style="font-size: 28px; margin-bottom: 16px;">Welcome to Signalze</h1>
      <p>Really glad you're here.</p>
      <p>One thing I'd love to know: what are you hoping to track?</p>
      <p>For any query, bug report, or suggestion, feel free to contact me.</p>
      <p>
        Gmail: <a href="mailto:deepmishra1283@gmail.com" style="color:#1f1f19;">deepmishra1283@gmail.com</a><br />
        X: <a href="https://x.com/deepmishra1283" style="color:#1f1f19;">https://x.com/deepmishra1283</a>
      </p>
      <p style="margin-top: 24px;">
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f1f19;color:#f7f4eb;text-decoration:none;">Open dashboard</a>
      </p>
      <p style="margin-top: 24px;">
        Talk soon,<br />
        Deep<br />
        Founder, Signalze
      </p>
    </div>
  `
  const text = `Welcome to Signalze. Really glad you're here.

One thing I'd love to know: what are you hoping to track?

For any query, bug report, or suggestion, feel free to contact me.
Gmail: deepmishra1283@gmail.com
X: https://x.com/deepmishra1283

Open your dashboard: ${dashboardUrl}

Talk soon,
Deep
Founder, Signalze`

  await sendEmail({
    to,
    subject,
    html,
    text,
    eventId: `welcome:${profile.id}`,
  })
}

export async function sendPaymentGreetingEmail(payload: PaymentGreetingPayload) {
  const to = payload.email?.trim().toLowerCase()
  if (!to) {
    return
  }

  const env = getEmailEnv()
  const dashboardUrl = `${env?.appUrl ?? "https://www.signalze.com"}/dashboard`
  const safePlan = escapeHtml(planLabel(payload.planTier))
  const subject = "Your Signalze payment is confirmed"
  const html = `
    <div style="font-family: Georgia, serif; color: #1f1f19; line-height: 1.6;">
      <h1 style="font-size: 28px; margin-bottom: 16px;">Payment confirmed</h1>
      <p>Your Signalze ${safePlan} plan is active.</p>
      <p>You can continue tracking mentions and reviewing results in your dashboard.</p>
      <p style="margin-top: 24px;">
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f1f19;color:#f7f4eb;text-decoration:none;">Open dashboard</a>
      </p>
      <p style="margin-top: 24px;">
        For any query, bug report, or suggestion, feel free to contact me.<br />
        Gmail: <a href="mailto:deepmishra1283@gmail.com" style="color:#1f1f19;">deepmishra1283@gmail.com</a><br />
        X: <a href="https://x.com/deepmishra1283" style="color:#1f1f19;">https://x.com/deepmishra1283</a>
      </p>
      <p style="margin-top: 24px;">
        Talk soon,<br />
        Deep<br />
        Founder, Signalze
      </p>
    </div>
  `
  const text = `Payment confirmed.

Your Signalze ${planLabel(payload.planTier)} plan is active.

Open your dashboard: ${dashboardUrl}

For any query, bug report, or suggestion, feel free to contact me.
Gmail: deepmishra1283@gmail.com
X: https://x.com/deepmishra1283

Talk soon,
Deep
Founder, Signalze`

  await sendEmail({
    to,
    subject,
    html,
    text,
    eventId: `payment:${payload.eventId}`,
  })
}

export async function sendPilotRequestNotificationEmail(payload: PilotRequestNotificationPayload) {
  const env = getEmailEnv()
  const to = env?.pilotNotificationTo?.trim().toLowerCase()
  if (!to) {
    return
  }

  const subject = `New pilot request: ${payload.name}`
  const safeName = escapeHtml(payload.name)
  const safeEmail = escapeHtml(payload.email)
  const safeAppUrl = escapeHtml(payload.appUrl)
  const safeScope = escapeHtml(payload.testingScope).replaceAll("\n", "<br />")
  const safeRequestId = escapeHtml(payload.requestId)
  const safeCreatedAt = escapeHtml(payload.createdAt)

  const html = `
    <div style="font-family: Georgia, serif; color: #1f1f19; line-height: 1.6;">
      <h1 style="font-size: 28px; margin-bottom: 16px;">New pilot request</h1>
      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> <a href="mailto:${safeEmail}" style="color:#1f1f19;">${safeEmail}</a></p>
      <p><strong>App URL:</strong> <a href="${safeAppUrl}" style="color:#1f1f19;">${safeAppUrl}</a></p>
      <p><strong>What to test:</strong><br />${safeScope}</p>
      <p><strong>Request ID:</strong> ${safeRequestId}<br /><strong>Created at:</strong> ${safeCreatedAt}</p>
    </div>
  `

  const text = `New pilot request

Name: ${payload.name}
Email: ${payload.email}
App URL: ${payload.appUrl}
What to test: ${payload.testingScope}
Request ID: ${payload.requestId}
Created at: ${payload.createdAt}`

  await sendEmail({
    to,
    subject,
    html,
    text,
    eventId: `pilot-request:${payload.requestId}`,
  })
}
