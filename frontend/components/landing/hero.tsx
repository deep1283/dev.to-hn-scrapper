"use client"

import { ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Reveal } from "@/components/landing/reveal"

const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 md:pb-32 md:pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-16">
        {/* Left — Copy */}
        <Reveal className="flex flex-col gap-7" delay={0.05}>
          <p className="font-handwriting text-lg text-primary">Your product is being talked about right now. Are you seeing it?</p>
          <h1 className="font-serif text-3xl leading-[1.15] text-foreground sm:text-5xl md:text-6xl lg:text-[4.25rem]">
            Never miss a conversation{" "}
            <span className="squiggly-underline">that matters</span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            Track brand mentions, competitor mentions, and high-intent keyword discussions across HN, Dev.to, and GitHub Discussions. Engage early, support faster, and find buying signals sooner.
          </p>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground/90">
            Signalze is built for founders, developer marketing teams, and DevRel teams that need one dashboard for the conversations that move pipeline and product feedback.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href={AUTH_ENTRY_PATH}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
            >
              Start tracking for free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={AUTH_ENTRY_PATH}
              className="inline-flex items-center justify-center rounded-full border border-border px-7 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Log in
            </Link>
          </div>
        </Reveal>

        {/* Right — Phone mockup */}
        <div className="relative flex items-center justify-center md:justify-end">
          {/* Subtle pedestal shadow */}
          <div className="absolute -bottom-6 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-[50%] bg-border/60 blur-xl" />

          <Reveal className="relative z-10 flex w-full items-center justify-center lg:justify-end" delay={0.12}>
            <div className="relative flex w-full max-w-[340px] items-center justify-center overflow-hidden sm:max-w-[380px]">
              <Image
                src="/images/sketch_hero.png"
                alt="Signalze minimalist sketch showing a user checking a real-time brand mention feed"
                width={380}
                height={520}
                priority
                className="h-auto w-full"
                style={{ transform: "rotate(-2deg)" }}
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
