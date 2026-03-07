import { NextRequest, NextResponse } from "next/server"

import { sendPilotRequestNotificationEmail } from "@/lib/server/email"
import { badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp, parseJsonBody } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { normalizeInput, validateEmail } from "@/lib/server/validation"

type CreatePilotRequestBody = {
  name?: string
  email?: string
  appUrl?: string
  testingScope?: string
}

type InsertedPilotRequestRow = {
  id: string
  created_at: string
}

function getServiceEnv() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Pilot request API is not configured.")
  }

  return { supabaseUrl, serviceRoleKey }
}

function headersForServiceRole(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  }
}

function validateName(value: unknown): string {
  if (typeof value !== "string") {
    throw badRequest("Name is required.")
  }

  const normalized = normalizeInput(value).slice(0, 120)
  if (!normalized) {
    throw badRequest("Name is required.")
  }

  return normalized
}

function validateAppUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw badRequest("App URL is required.")
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw badRequest("App URL is required.")
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw badRequest("Enter a valid app URL.")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw badRequest("App URL must start with http:// or https://.")
  }

  return parsed.toString().slice(0, 500)
}

function validateTestingScope(value: unknown): string {
  if (typeof value !== "string") {
    throw badRequest("Please describe what we should test.")
  }

  const normalized = normalizeInput(value).slice(0, 2000)
  if (normalized.length < 10) {
    throw badRequest("Please add more detail about what we should test.")
  }

  return normalized
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request)
    const rate = await takeRateLimit(`pilot-requests:create:${ip}`, 12, 60_000)
    if (!rate.allowed) {
      throw tooManyRequests()
    }

    const body = await parseJsonBody<CreatePilotRequestBody>(request)
    const payload = {
      name: validateName(body.name),
      email: validateEmail(body.email),
      app_url: validateAppUrl(body.appUrl),
      testing_scope: validateTestingScope(body.testingScope),
    }

    const { supabaseUrl, serviceRoleKey } = getServiceEnv()
    const response = await fetch(`${supabaseUrl}/rest/v1/pilot_requests?select=id,created_at`, {
      method: "POST",
      headers: {
        ...headersForServiceRole(serviceRoleKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify([payload]),
      cache: "no-store",
    })

    if (!response.ok) {
      throw new Error(`Supabase pilot request insert failed (${response.status})`)
    }

    const rows = (await response.json().catch(() => [])) as InsertedPilotRequestRow[]
    const inserted = rows[0]
    if (!inserted) {
      throw new Error("Pilot request insert returned no row.")
    }

    await sendPilotRequestNotificationEmail({
      requestId: inserted.id,
      createdAt: inserted.created_at,
      name: payload.name,
      email: payload.email,
      appUrl: payload.app_url,
      testingScope: payload.testing_scope,
    }).catch((error) => {
      console.warn("[email] Unable to send pilot request notification.", error)
    })

    return NextResponse.json({
      ok: true,
      requestId: inserted.id,
      createdAt: inserted.created_at,
    })
  } catch (error) {
    return toErrorResponse("api/pilot-requests:post", error, "Unable to submit pilot request.")
  }
}
