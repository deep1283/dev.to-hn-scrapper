import { NextRequest, NextResponse } from "next/server"

import { isPlanId, type PlanId } from "@/lib/plans"
import { requireAuth } from "@/lib/server/authz"
import { AppError, badRequest, toErrorResponse, tooManyRequests } from "@/lib/server/errors"
import { getRequestIp } from "@/lib/server/request"
import { takeRateLimit } from "@/lib/server/rate-limit"
import { withSessionCookie } from "@/lib/server/session"

type CheckoutResponse = {
  checkout_url?: string | null
}

const PRODUCT_IDS: Record<PlanId, string | undefined> = {
  starter_9: process.env.DODO_PRODUCT_ID_PLUS,
  growth_15: process.env.DODO_PRODUCT_ID_PRO,
}

function getDodoConfig() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  const mode = (process.env.DODO_PAYMENTS_MODE ?? "live").toLowerCase()
  const defaultBaseUrl = mode === "test" ? "https://test.dodopayments.com" : "https://live.dodopayments.com"
  const baseUrl = (process.env.DODO_API_BASE_URL ?? defaultBaseUrl).replace(/\/+$/, "")
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")

  if (!apiKey) {
    throw new AppError(500, "Checkout is not configured.", "Missing DODO_PAYMENTS_API_KEY.")
  }
  if (!appUrl) {
    throw new AppError(500, "Checkout is not configured.", "Missing APP_URL or NEXT_PUBLIC_APP_URL.")
  }

  return { apiKey, baseUrl, appUrl }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const ip = getRequestIp(request)
    const limit = await takeRateLimit(`billing:checkout:${auth.userId}:${ip}`, 30, 60_000)
    if (!limit.allowed) {
      throw tooManyRequests("Too many checkout attempts. Please wait and try again.")
    }

    const { apiKey, baseUrl, appUrl } = getDodoConfig()

    const planParam = request.nextUrl.searchParams.get("plan")
    const plan: PlanId = isPlanId(planParam) ? planParam : "starter_9"
    const billingParam = request.nextUrl.searchParams.get("billing")
    if (billingParam && billingParam !== "paid") {
      throw badRequest("Trial checkout is not supported. Start your free trial from pricing.")
    }
    const billing = "paid"
    const productId = PRODUCT_IDS[plan]
    if (!productId) {
      throw new AppError(500, "Plan checkout is not configured.", `Missing product ID for ${plan}.`)
    }

    const trialDays = 0

    const response = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        customer: auth.email ? { email: auth.email } : undefined,
        metadata: {
          user_id: auth.userId,
          plan_id: plan,
          billing_mode: billing,
          trial_days: String(trialDays),
          user_email: auth.email ?? null,
        },
        subscription_data: {
          trial_period_days: trialDays,
        },
        return_url: `${appUrl}/dashboard?checkout=return`,
      }),
      cache: "no-store",
    })

    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | CheckoutResponse | null

    if (!response.ok) {
      const details =
        payload && typeof payload === "object"
          ? "message" in payload
            ? payload.message
            : "error" in payload
              ? payload.error
              : undefined
          : undefined
      throw new AppError(502, "Unable to start checkout.", details ?? `Dodo API status ${response.status}`)
    }

    const checkoutUrl =
      payload && typeof payload === "object" && "checkout_url" in payload ? (payload.checkout_url ?? undefined) : undefined
    if (!checkoutUrl) {
      throw new AppError(502, "Unable to start checkout.", "Dodo response missing checkout_url.")
    }

    const destination = new URL(checkoutUrl)
    const redirect = NextResponse.redirect(destination)
    return withSessionCookie(redirect, auth.sessionResult)
  } catch (error) {
    return toErrorResponse("api/dodo/checkout", error, "Unable to start checkout.")
  }
}
