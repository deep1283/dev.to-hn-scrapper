import type { ReactNode } from "react"
import Link from "next/link"

const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"

type FaqItem = {
  question: string
  answer: string
}

type SourceMonitoringPageProps = {
  eyebrow: string
  title: string
  summary: string
  intro: string
  whatYouTrack: string[]
  whyItMatters: string[]
  faqs: FaqItem[]
  ctaLabel: string
  children?: ReactNode
}

export function SourceMonitoringPage({
  eyebrow,
  title,
  summary,
  intro,
  whatYouTrack,
  whyItMatters,
  faqs,
  ctaLabel,
  children,
}: SourceMonitoringPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-5xl space-y-10">
        <header className="space-y-5">
          <p className="font-handwriting text-lg text-primary">{eyebrow}</p>
          <h1 className="max-w-4xl font-serif text-3xl text-foreground sm:text-5xl">{title}</h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">{summary}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={AUTH_ENTRY_PATH}
              className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
            >
              Start tracking for free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              See pricing
            </Link>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
            <h2 className="font-serif text-2xl text-foreground">Why teams use Signalze here</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{intro}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
            <h2 className="font-serif text-2xl text-foreground">Best for</h2>
            <ul className="mt-4 space-y-3 text-sm text-foreground/90">
              {whyItMatters.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1 h-2 w-2 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
          <h2 className="font-serif text-2xl text-foreground">What Signalze tracks</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {whatYouTrack.map((item) => (
              <div key={item} className="rounded-xl border border-border/50 px-4 py-3 text-sm text-foreground/90">
                {item}
              </div>
            ))}
          </div>
        </section>

        {children}

        <section className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
          <h2 className="font-serif text-2xl text-foreground">Frequently asked questions</h2>
          <div className="mt-6 space-y-5">
            {faqs.map((item) => (
              <div key={item.question} className="border-b border-border/40 pb-5 last:border-b-0 last:pb-0">
                <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border/60 bg-card px-6 py-10 text-center shadow-sm sm:px-10">
          <p className="font-handwriting text-lg text-primary">{ctaLabel}</p>
          <h2 className="mt-2 font-serif text-3xl text-foreground">Start monitoring conversations before your competitors do</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Track your product name, brand name, competitors, launch keywords, or problem-space phrases across active developer communities.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href={AUTH_ENTRY_PATH}
              className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
            >
              Create free account
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Talk to us
            </Link>
          </div>
        </section>
      </article>
    </main>
  )
}
