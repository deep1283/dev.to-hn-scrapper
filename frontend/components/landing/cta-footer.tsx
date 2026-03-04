import { ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Reveal } from "@/components/landing/reveal"

const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"

function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M14.1 10.2 21.8 1h-1.8l-6.7 8-5.3-8H2l8 12-8 9.5h1.8l7-8.4 5.6 8.4H22z" />
    </svg>
  )
}

export function CTAFooter() {
  return (
    <>
      {/* CTA Section */}
      <section className="px-6 py-20 md:py-32">
        <Reveal className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl bg-card border border-border/60 px-8 py-16 text-center shadow-sm md:px-16">
            {/* Decorative accent */}
            <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />

            <p className="font-handwriting text-lg text-primary">
              Ready to get started?
            </p>
            <h2 className="mt-3 font-serif text-4xl text-foreground md:text-5xl text-balance">
              Start tracking your brand today
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Join teams using Signalze to stay on top of every Hacker News,
              Dev.to, and GitHub Discussions conversation about their brand.
            </p>
            <Link
              href={AUTH_ENTRY_PATH}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
            >
              Start 2-day trial <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Need app pilot testing?{" "}
              <Link href="/pilot-testing" className="font-medium text-foreground underline underline-offset-4">
                $4 per session
              </Link>
            </p>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 px-6 py-10">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <Link
            href="/"
            className="inline-flex items-center gap-3"
            aria-label="Signalze home"
          >
            <Image
              src="/logo.png"
              alt="Signalze"
              width={640}
              height={640}
              className="h-10 w-10 rounded-md object-cover"
            />
            <span className="font-serif text-xl font-bold text-foreground">signalze</span>
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </Link>

            <Link
              href="/#pricing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/pilot-testing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Pilot testing
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/contact"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </Link>
            <Link
              href="https://x.com/deepmishra1283"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Follow Signalze updates on X"
            >
              <XLogo className="h-3.5 w-3.5" />
              Follow on X for updates
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Signalze. All rights reserved.
          </p>
        </Reveal>
      </footer>
    </>
  )
}
