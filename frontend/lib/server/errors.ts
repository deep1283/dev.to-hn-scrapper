import { NextResponse } from "next/server"

export class AppError extends Error {
  status: number
  clientMessage: string
  link?: string

  constructor(status: number, clientMessage: string, internalMessage?: string, link?: string) {
    super(internalMessage ?? clientMessage)
    this.status = status
    this.clientMessage = clientMessage
    this.link = link
  }
}

export function resolveSignalzeHomeUrl(): string {
  const configured = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.signalze.com").trim()
  return configured.replace(/\/+$/, "") || "https://www.signalze.com"
}

export function badRequest(message = "Invalid request payload."): AppError {
  return new AppError(400, message)
}

export function unauthorized(message = "Please log in to continue."): AppError {
  return new AppError(401, message)
}

export function forbidden(message = "You do not have access to this resource."): AppError {
  return new AppError(403, message)
}

export function paymentRequired(
  message = `Your trial has ended. Please subscribe for more at ${resolveSignalzeHomeUrl()}.`,
): AppError {
  return new AppError(402, message, undefined, resolveSignalzeHomeUrl())
}

export function tooManyRequests(message = "Too many requests. Please try again shortly."): AppError {
  return new AppError(429, message)
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(typeof error === "string" ? error : "Unknown error")
}

export function logServerError(context: string, error: unknown, metadata?: Record<string, unknown>) {
  const normalized = asError(error)
  console.error(`[${context}]`, {
    message: normalized.message,
    stack: normalized.stack,
    ...(metadata ?? {}),
  })
}

export function toErrorResponse(context: string, error: unknown, fallbackMessage = "Request failed.") {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.clientMessage,
        ...(error.link ? { link: error.link } : {}),
      },
      { status: error.status },
    )
  }

  logServerError(context, error)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}
