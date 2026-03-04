import { NextResponse } from "next/server"

import { clearSessionCookie } from "@/lib/server/session"

export async function POST() {
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  response.cookies.set({
    name: "__session",
    value: "",
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  })
  response.cookies.set({
    name: "__client_uat",
    value: "",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  })
  return response
}
