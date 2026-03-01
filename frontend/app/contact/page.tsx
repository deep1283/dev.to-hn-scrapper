import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Signalze for support or product questions.",
  alternates: {
    canonical: "/contact",
  },
}

function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M14.1 10.2 21.8 1h-1.8l-6.7 8-5.3-8H2l8 12-8 9.5h1.8l7-8.4 5.6 8.4H22z" />
    </svg>
  )
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <p className="font-handwriting text-lg text-primary">Contact</p>
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">Get in touch</h1>
        <p className="mt-4 text-base text-muted-foreground">
          For support, product questions, or partnership requests, use the channels below.
        </p>

        <div className="mt-10 space-y-6 text-sm text-foreground/90">
          <section>
            <h2 className="font-serif text-2xl text-foreground">Email</h2>
            <p className="mt-3">
              <a className="underline underline-offset-4" href="mailto:deepmishra1283@gmail.com">
                deepmishra1283@gmail.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">X</h2>
            <a
              href="https://x.com/deepmishra1283"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 underline underline-offset-4"
            >
              <XLogo />
              x.com/deepmishra1283
            </a>
            <p className="mt-2 text-muted-foreground">Follow on X for more updates.</p>
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
