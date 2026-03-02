import { NextRequest, NextResponse } from "next/server"

import { unauthorized } from "@/lib/server/errors"
import { getAuthUser, refreshSession, type ServerSession } from "@/lib/server/supabase"

const SESSION_COOKIE_NAME = "signalze_session"
const REFRESH_GRACE_MS = 60_000

export type SessionResult = {
  session: ServerSession
  refreshed: boolean
}

function encodeSession(session: ServerSession): string {
  const payload = JSON.stringify(session)
  return Buffer.from(payload, "utf8").toString("base64url")
}

function decodeSession(rawValue: string | undefined): ServerSession | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(rawValue, "base64url").toString("utf8")) as ServerSession
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user?.id) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function addSessionCookie(response: NextResponse, session: ServerSession) {
  const maxAgeSeconds = Math.max(Math.floor((session.expiresAt - Date.now()) / 1000), 60)
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: encodeSession(session),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  })
}

async function validateSession(rawSession: ServerSession): Promise<SessionResult> {
  let session = rawSession
  let refreshed = false

  if (session.expiresAt <= Date.now() + REFRESH_GRACE_MS) {
    session = await refreshSession(session.refreshToken)
    refreshed = true
  }

  try {
    const user = await getAuthUser(session.accessToken)
    if (session.user.id !== user.id || session.user.email !== user.email) {
      session = {
        ...session,
        user,
      }
      refreshed = true
    }
  } catch {
    session = await refreshSession(session.refreshToken)
    const user = await getAuthUser(session.accessToken)
    session = {
      ...session,
      user,
    }
    refreshed = true
  }

  return { session, refreshed }
}

export async function requireSession(request: NextRequest): Promise<SessionResult> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const parsed = decodeSession(cookieValue)
  if (!parsed) {
    throw unauthorized()
  }

  try {
    return await validateSession(parsed)
  } catch {
    throw unauthorized()
  }
}

export function withSessionCookie(response: NextResponse, sessionResult?: SessionResult | null): NextResponse {
  if (sessionResult?.refreshed) {
    addSessionCookie(response, sessionResult.session)
  }
  return response
}

export function createSessionResponse(payload: Record<string, unknown>, session: ServerSession): NextResponse {
  const response = NextResponse.json(payload)
  addSessionCookie(response, session)
  return response
}
