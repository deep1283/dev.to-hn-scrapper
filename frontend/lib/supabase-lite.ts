export type PlanTier = "starter_9" | "growth_15"
export type BillingMode = "trial" | "paid"

type Nullable<T> = T | null

export type SessionData = {
  user: {
    id: string
    email?: string
  }
}

export type ProfileRow = {
  id: string
  email: Nullable<string>
  plan_tier: PlanTier
  pending_plan_tier: Nullable<PlanTier>
  pending_plan_effective_at: Nullable<string>
  billing_mode: Nullable<BillingMode>
  plan_selected_at: Nullable<string>
  trial_started_at: Nullable<string>
  trial_ends_at: Nullable<string>
  onboarding_completed: boolean
}

export type KeywordRow = {
  id: string
  query: string
  is_active: boolean
}

type SessionPayload = {
  user: SessionData["user"]
  profile: ProfileRow
  nextRoute: string
}

type OnboardingSetupPayload = {
  ok: boolean
  nextRoute: string
  bootstrapping: boolean
  cacheHits: number
  cacheMisses: number
  insertedMatches: number
  triggeredRunNow: boolean
  jobId: string | null
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  })

  const payload = (await response.json().catch(() => null)) as { error?: string } | T | null
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined
    throw new Error(message ?? "Request failed.")
  }

  return payload as T
}

export function clearStoredSession() {
  void fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined)
}

export function getStoredSession(): SessionData | null {
  return null
}

export async function getValidSession(): Promise<SessionData | null> {
  const payload = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (payload.status === 401) {
    return null
  }

  if (!payload.ok) {
    throw new Error("Unable to load session.")
  }

  const data = (await payload.json()) as SessionPayload
  return { user: data.user }
}

export async function signInWithPassword(email: string, password: string): Promise<SessionData> {
  const payload = await apiRequest<SessionPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      mode: "signin",
      email,
      password,
    }),
  })
  return { user: payload.user }
}

export async function signUpWithPassword(email: string, password: string): Promise<SessionData> {
  const payload = await apiRequest<SessionPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      mode: "signup",
      email,
      password,
    }),
  })
  return { user: payload.user }
}

export async function getProfile(): Promise<ProfileRow | null> {
  const payload = await apiRequest<SessionPayload>("/api/auth/session", { method: "GET" })
  return payload.profile ?? null
}

export async function ensureProfile(session: SessionData): Promise<ProfileRow> {
  void session
  const profile = await getProfile()
  if (!profile) {
    throw new Error("Unable to load profile.")
  }
  return profile
}

export async function updateProfile(
  _session: SessionData,
  patch: Partial<ProfileRow> & Record<string, unknown>,
): Promise<ProfileRow | null> {
  const payload = await apiRequest<{ profile: ProfileRow }>("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
  return payload.profile
}

export async function listKeywords(_session: SessionData, includeInactive = false): Promise<KeywordRow[]> {
  const payload = await apiRequest<{ keywords: KeywordRow[] }>(
    `/api/tracking/keywords?includeInactive=${includeInactive ? "true" : "false"}`,
    { method: "GET" },
  )
  return payload.keywords
}

export async function insertKeyword(_session: SessionData, query: string): Promise<KeywordRow> {
  const payload = await apiRequest<{ keyword: KeywordRow }>("/api/tracking/keywords", {
    method: "POST",
    body: JSON.stringify({ query }),
  })
  return payload.keyword
}

export async function updateKeyword(
  _session: SessionData,
  keywordId: string,
  patch: Partial<KeywordRow>,
): Promise<KeywordRow | null> {
  const payload = await apiRequest<{ keyword: KeywordRow }>("/api/tracking/keywords", {
    method: "PATCH",
    body: JSON.stringify({
      id: keywordId,
      query: patch.query,
      isActive: patch.is_active,
    }),
  })
  return payload.keyword
}

export async function syncTrackingSetup(_session: SessionData, terms: string[]): Promise<OnboardingSetupPayload> {
  return apiRequest<OnboardingSetupPayload>("/api/onboarding/setup", {
    method: "POST",
    body: JSON.stringify({
      terms,
    }),
  })
}
