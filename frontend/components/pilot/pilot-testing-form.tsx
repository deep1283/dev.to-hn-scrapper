"use client"

import { FormEvent, useState } from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type FormState = {
  name: string
  email: string
  appUrl: string
  testingScope: string
}

const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  appUrl: "",
  testingScope: "",
}

export function PilotTestingForm() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    setSubmitted(false)

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/pilot-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Unable to submit pilot request.")
      }

      setSubmitted(true)
      setForm(INITIAL_FORM)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to submit pilot request.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
      <h2 className="font-serif text-2xl text-foreground sm:text-3xl">Request human pilot testing</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Fill this form to start. We will reply with availability, final scope, and a testing plan.
      </p>

      <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="grid gap-1.5">
          <span className="text-sm text-foreground">Name</span>
          <Input
            required
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Your name"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm text-foreground">Email</span>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="you@company.com"
          />
        </label>

        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm text-foreground">App URL</span>
          <Input
            required
            type="url"
            value={form.appUrl}
            onChange={(event) => updateField("appUrl", event.target.value)}
            placeholder="https://example.com"
          />
        </label>

        <label className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm text-foreground">What should we test?</span>
          <Textarea
            required
            value={form.testingScope}
            onChange={(event) => updateField("testingScope", event.target.value)}
            placeholder="Onboarding, checkout flow, notifications, edge cases, performance, etc."
            rows={4}
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="sm:col-span-2 inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
        >
          {isSubmitting ? "Submitting..." : "Submit pilot request"}
        </button>

        <p className="sm:col-span-2 text-xs text-muted-foreground">
          Pricing: <span className="font-semibold text-foreground">$4 per session</span>. Generally one session is
          enough for MVP testing.
        </p>

        {submitError ? (
          <p className="sm:col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{submitError}</p>
        ) : null}
      </form>

      <p className="mt-4 text-xs text-muted-foreground">We will contact you at your email address shortly.</p>

      {submitted ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-xl text-foreground">Request submitted</h3>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close success message"
              >
                <span aria-hidden="true">X</span>
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Thanks, your pilot request has been submitted. We will contact you at your email address shortly.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
