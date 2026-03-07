import Link from "next/link"
import { Reveal } from "@/components/landing/reveal"
import { PLAN_CONFIG, type PlanId } from "@/lib/plans"

const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"
const PLAN_ORDER: PlanId[] = ["starter_9", "growth_15"]
const SOURCES = ["Hacker News", "Dev.to", "GitHub Discussions"]

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function PricingFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckIcon />
      <span>{children}</span>
    </li>
  )
}

export function PricingSection() {
  return (
    <section id="pricing" className="px-4 py-16 sm:px-6 sm:py-20 md:py-32">
      <Reveal className="mx-auto max-w-5xl">
        <div className="flex flex-col items-center gap-12">
          <div className="text-center">
            <p className="font-handwriting text-lg text-primary">Pricing</p>
            <h2 className="mt-2 font-serif text-3xl text-foreground sm:text-5xl text-balance">
              Simple, honest pricing
            </h2>
            <p className="mt-4 max-w-xl mx-auto text-base text-muted-foreground">
              Track mentions for your keywords across Hacker News, Dev.to, and
              GitHub Discussions. Start with a 5-day free trial.
            </p>
          </div>

          <div className="grid w-full max-w-3xl gap-5 sm:grid-cols-2 sm:gap-6">
            {PLAN_ORDER.map((planId) => {
              const plan = PLAN_CONFIG[planId]
              const isPopular = planId === "growth_15"
              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col gap-6 rounded-2xl border bg-card p-6 transition-all duration-200 hover:shadow-lg sm:p-8 ${
                    isPopular
                      ? "border-accent shadow-md"
                      : "border-border/60"
                  }`}
                >
                  {isPopular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-semibold text-accent-foreground">
                      Most popular
                    </span>
                  ) : null}

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {plan.name}
                    </p>
                    <p className="mt-3 font-serif text-4xl text-foreground sm:text-5xl">
                      {plan.price}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>

                  <ul className="flex flex-col gap-2.5 text-sm text-foreground">
                    <PricingFeature>Up to {plan.maxKeywords} keywords</PricingFeature>
                    <PricingFeature>5-day free trial</PricingFeature>
                    {SOURCES.map((s) => (
                      <PricingFeature key={s}>{s}</PricingFeature>
                    ))}
                    {plan.id === "starter_9" ? (
                      <>
                        <PricingFeature>Dashboard updates</PricingFeature>
                        <PricingFeature>Standard refresh</PricingFeature>
                      </>
                    ) : (
                      <>
                        <PricingFeature>Slack updates</PricingFeature>
                        <PricingFeature>Faster fetching</PricingFeature>
                        <PricingFeature>X monitoring (coming soon)</PricingFeature>
                      </>
                    )}
                  </ul>
                </article>
              )
            })}
          </div>

          <Link
            href={AUTH_ENTRY_PATH}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
          >
            Get started free
          </Link>
        </div>
      </Reveal>
    </section>
  )
}
