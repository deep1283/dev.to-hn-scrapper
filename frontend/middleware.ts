import { NextRequest, NextResponse } from "next/server"

const SESSION_COOKIE = "signalze_session"
const PROTECTED_PATHS = ["/dashboard", "/onboarding", "/upgrade"]
const CLERK_SESSION_COOKIE = "__session"
const hasClerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`))
}

export function middleware(request: NextRequest) {
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
  loginUrl.pathname = hasClerkConfigured ? "/sign-in" : "/login"
  loginUrl.searchParams.set("next", pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/upgrade/:path*"],
}
