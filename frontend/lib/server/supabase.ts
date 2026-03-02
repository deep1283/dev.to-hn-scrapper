import { AppError } from "@/lib/server/errors"
import { getSupabaseEnv } from "@/lib/server/env"

export type PlanTier = "starter_9" | "growth_15"
export type BillingMode = "trial" | "paid"

type AuthResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: {
    id: string
    email?: string
  }
  error_description?: string
  msg?: string
}

export type ServerSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  user: {
    id: string
    email?: string
  }
}

export type ProfileRow = {
  id: string
  email: string | null
  clerk_user_id: string | null
  plan_tier: PlanTier
  pending_plan_tier: PlanTier | null
  pending_plan_effective_at: string | null
  billing_mode: BillingMode | null
  plan_selected_at: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  onboarding_completed: boolean
}

export type BrandRow = {
  id: string
  name: string
  is_active: boolean
}

export type KeywordRow = {
  id: string
  query: string
  is_active: boolean
  is_system: boolean
}

function baseHeaders(accessToken?: string): Record<string, string> {
  const { supabaseAnonKey } = getSupabaseEnv()
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${accessToken ?? supabaseAnonKey}`,
    "Content-Type": "application/json",
  }
}

function buildSession(payload: AuthResponse): ServerSession {
  if (!payload.access_token || !payload.refresh_token || !payload.user?.id) {
    throw new AppError(401, "Authentication failed.", "Auth response missing session fields.")
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    user: {
      id: payload.user.id,
      email: payload.user.email,
    },
  }
}

async function authRequest(path: string, init: RequestInit): Promise<AuthResponse> {
  const { supabaseUrl } = getSupabaseEnv()
  const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers: {
      ...baseHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as AuthResponse
  if (!response.ok) {
    throw new AppError(401, "Authentication failed.", payload.error_description ?? payload.msg ?? "Supabase auth error")
  }

  return payload
}

type SupabaseErrorPayload = {
  message?: string
  error?: string
}

export async function restRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const { supabaseUrl } = getSupabaseEnv()
  const method = (init?.method ?? "GET").toUpperCase()
  const headers = new Headers(baseHeaders(accessToken))

  if (init?.headers) {
    const incoming = new Headers(init.headers)
    incoming.forEach((value, key) => headers.set(key, value))
  }

  if (method !== "GET" && method !== "HEAD" && !headers.has("Prefer")) {
    headers.set("Prefer", "return=representation")
  }

  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as SupabaseErrorPayload | T | null
  if (!response.ok) {
    const details =
      payload && typeof payload === "object"
        ? "message" in payload
          ? payload.message
          : "error" in payload
            ? payload.error
            : undefined
        : undefined

    console.error(`[restRequest] Supabase REST error on ${path}:`, { status: response.status, details })
    throw new AppError(400, "Request could not be completed.", details ?? `Supabase REST status ${response.status}`)
  }

  return payload as T
}

export async function signInWithPassword(email: string, password: string): Promise<ServerSession> {
  const payload = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  return buildSession(payload)
}

export async function signUpWithPassword(email: string, password: string): Promise<ServerSession> {
  const payload = await authRequest("/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })

  if (!payload.access_token || !payload.refresh_token || !payload.user) {
    throw new AppError(
      400,
      "Account created. Please verify your email before signing in.",
      "Signup requires email confirmation.",
    )
  }

  return buildSession(payload)
}

export async function refreshSession(refreshToken: string): Promise<ServerSession> {
  const payload = await authRequest("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  return buildSession(payload)
}

export async function getAuthUser(accessToken: string): Promise<{ id: string; email?: string }> {
  const { supabaseUrl } = getSupabaseEnv()
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: baseHeaders(accessToken),
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as { id?: string; email?: string } | null
  if (!response.ok || !payload?.id) {
    throw new AppError(401, "Authentication failed.", "Unable to resolve auth user.")
  }

  return {
    id: payload.id,
    email: payload.email,
  }
}

const PROFILE_SELECT =
  "id,email,clerk_user_id,plan_tier,pending_plan_tier,pending_plan_effective_at,billing_mode,plan_selected_at,trial_started_at,trial_ends_at,onboarding_completed"

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function getProfileById(accessToken: string, userId: string): Promise<ProfileRow | null> {
  try {
    const rows = await restRequest<ProfileRow[]>(
      `/profiles?id=eq.${encodeURIComponent(userId)}&select=${PROFILE_SELECT}`,
      accessToken,
    )
    return rows[0] ?? null
  } catch (error) {
    const details = error instanceof Error ? error.message.toLowerCase() : ""
    if (!details.includes("pending_plan_tier")) {
      throw error
    }

    const legacyRows = await restRequest<
      Array<
        Omit<ProfileRow, "clerk_user_id" | "pending_plan_tier" | "pending_plan_effective_at"> & {
          clerk_user_id?: null
          pending_plan_tier?: null
          pending_plan_effective_at?: null
        }
      >
    >(
      `/profiles?id=eq.${encodeURIComponent(
        userId,
      )}&select=id,email,plan_tier,billing_mode,plan_selected_at,trial_started_at,trial_ends_at,onboarding_completed`,
      accessToken,
    )
    const legacy = legacyRows[0]
    if (!legacy) {
      return null
    }
    return {
      ...legacy,
      clerk_user_id: null,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
    }
  }
}

async function getProfileByClerkUserId(accessToken: string, clerkUserId: string): Promise<ProfileRow | null> {
  try {
    const rows = await restRequest<ProfileRow[]>(
      `/profiles?clerk_user_id=eq.${encodeURIComponent(clerkUserId)}&select=${PROFILE_SELECT}&limit=1`,
      accessToken,
    )
    return rows[0] ?? null
  } catch (error) {
    const details = error instanceof Error ? error.message.toLowerCase() : ""
    if (details.includes("clerk_user_id")) {
      throw new AppError(
        500,
        "Authentication setup is incomplete. Please contact support.",
        "profiles.clerk_user_id is missing. Run Clerk migration.",
      )
    }

    if (!details.includes("pending_plan_tier")) {
      throw error
    }

    const legacyRows = await restRequest<
      Array<
        Omit<ProfileRow, "pending_plan_tier" | "pending_plan_effective_at"> & {
          pending_plan_tier?: null
          pending_plan_effective_at?: null
        }
      >
    >(
      `/profiles?clerk_user_id=eq.${encodeURIComponent(
        clerkUserId,
      )}&select=id,email,clerk_user_id,plan_tier,billing_mode,plan_selected_at,trial_started_at,trial_ends_at,onboarding_completed&limit=1`,
      accessToken,
    )
    const legacy = legacyRows[0]
    if (!legacy) {
      return null
    }
    return {
      ...legacy,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
    }
  }
}

async function getProfileByEmail(accessToken: string, email: string): Promise<ProfileRow | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  try {
    const rows = await restRequest<ProfileRow[]>(
      `/profiles?email=eq.${encodeURIComponent(normalized)}&select=${PROFILE_SELECT}&limit=1`,
      accessToken,
    )
    return rows[0] ?? null
  } catch (error) {
    const details = error instanceof Error ? error.message.toLowerCase() : ""
    if (!details.includes("pending_plan_tier")) {
      throw error
    }

    const legacyRows = await restRequest<
      Array<
        Omit<ProfileRow, "pending_plan_tier" | "pending_plan_effective_at"> & {
          pending_plan_tier?: null
          pending_plan_effective_at?: null
        }
      >
    >(
      `/profiles?email=eq.${encodeURIComponent(
        normalized,
      )}&select=id,email,clerk_user_id,plan_tier,billing_mode,plan_selected_at,trial_started_at,trial_ends_at,onboarding_completed&limit=1`,
      accessToken,
    )
    const legacy = legacyRows[0]
    if (!legacy) {
      return null
    }
    return {
      ...legacy,
      pending_plan_tier: null,
      pending_plan_effective_at: null,
    }
  }
}

export async function getProfile(accessToken: string, userId: string): Promise<ProfileRow | null> {
  if (isUuid(userId)) {
    return getProfileById(accessToken, userId)
  }

  return getProfileByClerkUserId(accessToken, userId)
}

async function applyPendingPlanIfDue(accessToken: string, userId: string, profile: ProfileRow): Promise<ProfileRow> {
  const pendingPlan = profile.pending_plan_tier
  const pendingEffectiveAt = profile.pending_plan_effective_at
  if (!pendingPlan || !pendingEffectiveAt) {
    return profile
  }

  const effectiveAtMs = new Date(pendingEffectiveAt).getTime()
  if (!Number.isFinite(effectiveAtMs)) {
    return patchProfile(accessToken, userId, {
      pending_plan_tier: null,
      pending_plan_effective_at: null,
    })
  }

  if (effectiveAtMs > Date.now()) {
    return profile
  }

  return patchProfile(accessToken, userId, {
    plan_tier: pendingPlan,
    pending_plan_tier: null,
    pending_plan_effective_at: null,
  })
}

export async function ensureProfile(accessToken: string, userId: string, email?: string): Promise<ProfileRow> {
  const existing = await getProfile(accessToken, userId)
  if (existing) {
    return applyPendingPlanIfDue(accessToken, existing.id, existing)
  }

  const isSupabaseUserId = isUuid(userId)
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined

  // Clerk users that already exist in DB (from pre-Clerk auth) should keep their existing plan/profile.
  if (!isSupabaseUserId && normalizedEmail) {
    const existingByEmail = await getProfileByEmail(accessToken, normalizedEmail)
    if (existingByEmail) {
      if (existingByEmail.clerk_user_id && existingByEmail.clerk_user_id !== userId) {
        throw new AppError(409, "This email is already linked to another account.")
      }

      const linked = await patchProfile(accessToken, existingByEmail.id, {
        clerk_user_id: userId,
        email: normalizedEmail,
      })
      return applyPendingPlanIfDue(accessToken, linked.id, linked)
    }
  }

  const profileId = isSupabaseUserId ? userId : crypto.randomUUID()
  await restRequest<ProfileRow[]>(`/profiles`, accessToken, {
    method: "POST",
    body: JSON.stringify([
      {
        id: profileId,
        email: normalizedEmail ?? null,
        clerk_user_id: isSupabaseUserId ? null : userId,
      },
    ]),
  })

  const created = await getProfile(accessToken, isSupabaseUserId ? profileId : userId)
  if (!created) {
    throw new AppError(500, "Unable to initialize profile.", "Profile insert did not return a row.")
  }
  return created
}

export async function patchProfile(
  accessToken: string,
  userId: string,
  patch: Partial<ProfileRow> & Record<string, unknown>,
): Promise<ProfileRow> {
  const rows = await restRequest<ProfileRow[]>(`/profiles?id=eq.${encodeURIComponent(userId)}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })

  if (!rows[0]) {
    throw new AppError(400, "Profile update failed.")
  }

  return rows[0]
}

export async function listBrands(accessToken: string, userId: string, includeInactive = false): Promise<BrandRow[]> {
  const activeFilter = includeInactive ? "" : "&is_active=is.true"
  return restRequest<BrandRow[]>(
    `/brands?user_id=eq.${encodeURIComponent(userId)}${activeFilter}&select=id,name,is_active&order=created_at.asc`,
    accessToken,
  )
}

export async function insertBrand(accessToken: string, userId: string, name: string): Promise<BrandRow> {
  const rows = await restRequest<BrandRow[]>(`/brands`, accessToken, {
    method: "POST",
    body: JSON.stringify([{ user_id: userId, name, is_active: true }]),
  })
  if (!rows[0]) {
    throw new AppError(400, "Failed to create brand.")
  }
  return rows[0]
}

export async function updateBrand(
  accessToken: string,
  userId: string,
  brandId: string,
  patch: Partial<BrandRow>,
): Promise<BrandRow> {
  const rows = await restRequest<BrandRow[]>(
    `/brands?id=eq.${encodeURIComponent(brandId)}&user_id=eq.${encodeURIComponent(userId)}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  )
  if (!rows[0]) {
    throw new AppError(404, "Brand not found.")
  }
  return rows[0]
}

export async function listKeywords(
  accessToken: string,
  userId: string,
  includeInactive = false,
  includeSystem = false,
): Promise<KeywordRow[]> {
  const activeFilter = includeInactive ? "" : "&is_active=is.true"
  const systemFilter = includeSystem ? "" : "&is_system=is.false"
  return restRequest<KeywordRow[]>(
    `/keywords?user_id=eq.${encodeURIComponent(
      userId,
    )}${systemFilter}${activeFilter}&select=id,query,is_active,is_system&order=created_at.asc`,
    accessToken,
  )
}

export async function insertKeyword(accessToken: string, userId: string, query: string): Promise<KeywordRow> {
  const rows = await restRequest<KeywordRow[]>(`/keywords`, accessToken, {
    method: "POST",
    body: JSON.stringify([{ user_id: userId, query, is_active: true, is_system: false }]),
  })
  if (!rows[0]) {
    throw new AppError(400, "Failed to create keyword.")
  }
  return rows[0]
}

export async function updateKeyword(
  accessToken: string,
  userId: string,
  keywordId: string,
  patch: Partial<KeywordRow>,
): Promise<KeywordRow> {
  const rows = await restRequest<KeywordRow[]>(
    `/keywords?id=eq.${encodeURIComponent(keywordId)}&user_id=eq.${encodeURIComponent(userId)}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  )
  if (!rows[0]) {
    throw new AppError(404, "Keyword not found.")
  }
  return rows[0]
}
