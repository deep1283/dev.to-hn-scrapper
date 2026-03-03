import { NextResponse } from "next/server"

function retiredResponse() {
  return NextResponse.json(
    { error: "Brand tracking has been retired. Use keywords only." },
    { status: 410 },
  )
}

export async function GET() {
  return retiredResponse()
}

export async function POST() {
  return retiredResponse()
}

export async function PATCH() {
  return retiredResponse()
}
