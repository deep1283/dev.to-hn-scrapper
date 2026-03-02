import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextFetchEvent, NextRequest, NextResponse } from "next/server"

const SESSION_COOKIE = "signalze_session"
const PROTECTED_PATHS = ["/dashboard", "/onboarding", "/upgrade"]
const CLERK_SESSION_COOKIE = "__session"
const hasClerkConfigured = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`))
}

const clerkAuthMiddleware = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl

  if (!isProtected(pathname)) {
    return NextResponse.next()
  }

  const hasSupabaseSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
  if (hasSupabaseSession) {
    return NextResponse.next()
  }

  const { userId } = await auth()
  if (userId) {
    return NextResponse.next()
  }

  const signInUrl = request.nextUrl.clone()
  signInUrl.pathname = "/sign-in"
  signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(signInUrl)
})

export function middleware(request: NextRequest, event: NextFetchEvent) {
  if (hasClerkConfigured) {
    return clerkAuthMiddleware(request, event)
  }

  const { pathname } = request.nextUrl

  if (!isProtected(pathname)) {
    return NextResponse.next()
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
  const hasClerkSession = Boolean(request.cookies.get(CLERK_SESSION_COOKIE)?.value)
  if (hasSession || hasClerkSession) {
    return NextResponse.next()
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = "/login"
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
