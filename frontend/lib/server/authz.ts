import { NextRequest } from "next/server"
import { auth as clerkAuth, clerkClient } from "@clerk/nextjs/server"

import { ensureActiveEntitlement } from "@/lib/server/validation"
import { ensureProfile } from "@/lib/server/supabase"
import { requireSession, type SessionResult } from "@/lib/server/session"

function clerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
}

function claimEmail(claims: Record<string, unknown> | undefined): string | undefined {
  const direct = claims?.email
  if (typeof direct === "string" && direct.trim()) {
    return direct
  }

  const alt = claims?.email_address
  if (typeof alt === "string" && alt.trim()) {
    return alt
  }

  return undefined
}

async function resolveClerkEmail(userId: string, claims: Record<string, unknown> | undefined): Promise<string | undefined> {
  const fromClaims = claimEmail(claims)
  if (fromClaims) {
    return fromClaims
  }

  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const primaryEmail =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress

    return typeof primaryEmail === "string" && primaryEmail.trim() ? primaryEmail : undefined
  } catch (error) {
    console.warn("[authz] Unable to resolve Clerk user email.", error)
    return undefined
  }
}

async function tryClerkAuth() {
  if (!clerkConfigured()) {
    return null
  }

  const clerk = await clerkAuth()
  if (!clerk.userId) {
    return null
  }

  const supabaseToken = await clerk.getToken({ template: "supabase" }).catch(() => null)
  const serviceRoleToken = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
  const token = supabaseToken ?? serviceRoleToken
  if (!token) {
    return null
  }

  if (!supabaseToken) {
    console.warn("[authz] Missing Clerk 'supabase' token template. Falling back to service role token.")
  }

  const claims = clerk.sessionClaims as Record<string, unknown> | undefined
  const email = await resolveClerkEmail(clerk.userId, claims)

  return {
    accessToken: token,
    userId: clerk.userId,
    email,
    provider: "clerk" as const,
  }
}

export type AuthContext = {
  sessionResult: SessionResult | null
  accessToken: string
  userId: string
  email?: string
  user: {
    id: string
    email?: string
  }
  provider: "supabase" | "clerk"
}

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const clerkContext = await tryClerkAuth()
  if (clerkContext) {
    return {
      sessionResult: null,
      accessToken: clerkContext.accessToken,
      userId: clerkContext.userId,
      email: clerkContext.email,
      user: {
        id: clerkContext.userId,
        email: clerkContext.email,
      },
      provider: clerkContext.provider,
    }
  }

  const sessionResult = await requireSession(request)
  return {
    sessionResult,
    accessToken: sessionResult.session.accessToken,
    userId: sessionResult.session.user.id,
    email: sessionResult.session.user.email,
    user: {
      id: sessionResult.session.user.id,
      email: sessionResult.session.user.email,
    },
    provider: "supabase",
  }
}

export async function requireEntitledAuth(request: NextRequest) {
  const auth = await requireAuth(request)
  const profile = await ensureProfile(auth.accessToken, auth.userId, auth.email)
  ensureActiveEntitlement(profile)
  return { ...auth, profile }
}
