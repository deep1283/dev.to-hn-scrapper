"use client"

import { ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

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
          </div>

        </div>

        {/* Right — Phone mockup */}
        <div className="relative flex items-center justify-center md:justify-end">
          {/* Subtle pedestal shadow */}
          <div className="absolute -bottom-6 left-1/2 h-8 w-3/4 -translate-x-1/2 rounded-[50%] bg-border/60 blur-xl" />

          <div className="relative z-10 flex w-full items-center justify-center lg:justify-end">
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
          </div>
        </div>
      </div>
    </section>
  )
}
