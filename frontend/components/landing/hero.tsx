"use client"

import { ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const floatingBadges = [
  { label: "Real-time alerts", position: "top-4 -right-4 md:top-6 md:-right-10" },
  { label: "Priority refresh", position: "top-1/3 -right-2 md:-right-8" },
  { label: "HN + Dev.to + GitHub", position: "bottom-16 -left-4 md:bottom-20 md:-left-8" },
  { label: "Dashboard monitoring", position: "bottom-4 -right-2 md:bottom-6 md:-right-6" },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-6 md:pb-32 md:pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Left — Copy */}
        <div className="flex flex-col gap-7">
          <p className="font-handwriting text-lg text-primary">Brand monitoring that ships results</p>
          <h1 className="font-serif text-4xl leading-[1.15] text-foreground sm:text-5xl md:text-6xl lg:text-[4.25rem]">
            Never miss a conversation{" "}
            <span className="squiggly-underline">that matters</span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Monitor HN, dev.to and GitHub Discussions for your brand or keywords. Engage early, grow faster.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
            >
              Start tracking for free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full border border-border px-7 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              See live dashboard
            </Link>
          </div>

        </div>

        {/* Right — Phone mockup */}
        <div className="relative flex items-center justify-center md:justify-end">
          {/* Subtle pedestal shadow */}
          <div className="absolute -bottom-6 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-[50%] bg-border/60 blur-xl" />

          <div className="relative z-10">
            <Image
              src="/images/hero-phone-ntree.png"
              alt="Signalze mobile app showing a real-time brand mention feed"
              width={380}
              height={520}
              priority
              className="h-auto w-full max-w-[340px] drop-shadow-2xl transition-transform hover:scale-[1.02] sm:max-w-[380px]"
              style={{ transform: "rotate(-2deg)" }}
            />

            {/* Floating badges */}
            {floatingBadges.map((badge) => (
              <span
                key={badge.label}
                className={`absolute ${badge.position} hidden rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm sm:inline-block`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
