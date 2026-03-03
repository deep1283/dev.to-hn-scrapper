import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms and conditions for using Signalze.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    url: "/terms",
    title: "Signalze Terms and Conditions",
    description: "Terms and conditions for using Signalze.",
  },
  twitter: {
    title: "Signalze Terms and Conditions",
    description: "Terms and conditions for using Signalze.",
  },
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <p className="font-handwriting text-lg text-primary">Legal</p>
        <h1 className="mt-2 font-serif text-3xl text-foreground sm:text-5xl">Terms and Conditions</h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: March 1, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-foreground/90">
          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">1. Acceptance</h2>
            <p className="mt-3">
              By using Signalze, you agree to these terms. If any part feels unclear or does not work for you yet,
              please reach out first and avoid using that part of the service until we help clarify it.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">2. Service Scope</h2>
            <p className="mt-3">
              Signalze monitors public discussions from supported sources and shows matched mentions in your dashboard.
              Coverage, frequency, and limits depend on your selected plan.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">3. Accounts and Access</h2>
            <p className="mt-3">
              You are responsible for activity under your account and for keeping your login access secure.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">4. Billing and Plan Changes</h2>
            <p className="mt-3">
              Paid plans are billed according to the checkout terms shown at purchase time. Upgrades may take effect
              immediately, while downgrades are applied at the next billing cycle according to your current settings.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">5. Acceptable Use</h2>
            <p className="mt-3">
              Do not use Signalze for unlawful activity, abuse, or attempts to disrupt the service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-foreground sm:text-2xl">6. Contact</h2>
            <p className="mt-3">
              Thank you for using Signalze. Questions about these terms can be sent to{" "}
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
