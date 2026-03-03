import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for Signalze.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    url: "/privacy",
    title: "Signalze Privacy Policy",
    description: "Privacy policy for Signalze.",
  },
  twitter: {
    title: "Signalze Privacy Policy",
    description: "Privacy policy for Signalze.",
  },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <p className="font-handwriting text-lg text-primary">Legal</p>
        <h1 className="mt-2 font-serif text-3xl text-foreground sm:text-5xl">Privacy Policy</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: March 1, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-foreground/90">
          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">1. Data We Collect</h2>
            <p className="mt-3">
              We store account details (such as email), your plan details, and the keywords you configure.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">2. What We Do Not Collect</h2>
            <p className="mt-3">
              card numbers (handled by dodo payments), government IDs, health data, biometric data, bank details,
              passwords.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">3. Mention Data</h2>
            <p className="mt-3">
              Signalze collects and displays public mention data from supported sources (Hacker News, Dev.to, and
              GitHub Discussions) based on your saved keywords.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">4. How We Use Data</h2>
            <p className="mt-3">
              We use your data to run monitoring, show dashboard results, enforce plan limits, and improve reliability.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">5. Third-Party Services</h2>
            <p className="mt-3">
              We use trusted providers to operate authentication, billing, and infrastructure. Those providers process
              only what is necessary to deliver the service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">6. Contact</h2>
            <p className="mt-3">
              Thank you for trusting Signalze. For privacy requests or questions, email{" "}
              <a className="break-all underline underline-offset-4" href="mailto:deepmishra1283@gmail.com">
                deepmishra1283@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-border/40 pt-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Back to home
          </Link>
        </div>
      </article>
    </main>
  )
}
