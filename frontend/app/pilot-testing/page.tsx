import type { Metadata } from "next"
import Link from "next/link"

import { PilotTestingForm } from "@/components/pilot/pilot-testing-form"

export const metadata: Metadata = {
  title: "Pilot Testing",
  description: "Signalze human pilot testing service for your app at $4 per session.",
  alternates: {
    canonical: "/pilot-testing",
  },
  openGraph: {
    url: "/pilot-testing",
    title: "Signalze Pilot Testing",
    description: "Human pilot testing for your app at $4 per session.",
  },
  twitter: {
    title: "Signalze Pilot Testing",
    description: "Human pilot testing for your app at $4 per session.",
  },
}

const TESTING_ITEMS = [
  "New user onboarding and first-time experience",
  "Main conversion paths (signup, purchase, activation)",
  "Core user journeys across desktop and mobile",
  "Functional bugs and confusing UX",
  "Provide written report + video proof",
]

export default function PilotTestingPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-4">
          <p className="font-handwriting text-lg text-primary">Signalze Service</p>
          <h1 className="font-serif text-3xl text-foreground sm:text-5xl">Human pilot testing for your app</h1>
          <p className="max-w-3xl text-base text-muted-foreground">
            We test your app with real-world usage patterns and provide written report + video proof of what breaks,
            what confuses users, and what should be fixed first.
          </p>
          <div className="inline-flex items-baseline gap-2 rounded-full border border-border/60 bg-card px-4 py-2">
            <span className="text-sm text-muted-foreground">Pricing</span>
            <span className="font-serif text-2xl text-foreground">$4</span>
            <span className="text-sm text-muted-foreground">per session</span>
          </div>
        </header>

        <section className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
          <h2 className="font-serif text-2xl text-foreground">What we test</h2>
          <ul className="mt-4 space-y-3 text-sm text-foreground/90">
            {TESTING_ITEMS.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="mt-1 h-2 w-2 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <PilotTestingForm />

        <section className="rounded-2xl border border-border/40 bg-card/50 p-5 text-sm text-foreground/90">
          <p>
            Prefer X?{" "}
            <a
              href="https://x.com/deepmishra1283"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              @deepmishra1283
            </a>
          </p>
        </section>

        <div className="border-t border-border/40 pt-4 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Back to home
          </Link>
        </div>
      </article>
    </main>
  )
}
