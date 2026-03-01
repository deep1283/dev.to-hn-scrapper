import Image from "next/image"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-20 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        {/* Phone stack — CSS-based overlapping cards */}
        <div className="order-2 md:order-1">
          <div className="relative mx-auto w-fit">
            {/* Back card */}
            <div className="absolute -left-6 top-4 h-[320px] w-[200px] rotate-[-8deg] rounded-3xl border border-border/60 bg-card shadow-sm sm:h-[380px] sm:w-[240px]" />
            {/* Middle card */}
            <div className="absolute -right-4 top-2 h-[320px] w-[200px] rotate-[6deg] rounded-3xl border border-border/60 bg-card shadow-sm sm:h-[380px] sm:w-[240px]" />
            {/* Front card */}
            <div className="relative z-10 mx-auto overflow-hidden rounded-3xl border border-border/60 bg-card shadow-lg">
              <Image
                src="/images/hero-phone-ntree.png"
                alt="Signalze app showing mentions feed and notification settings"
                width={240}
                height={380}
                className="h-[320px] w-[200px] object-cover object-top sm:h-[380px] sm:w-[240px]"
              />
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="order-1 flex flex-col gap-6 md:order-2">
          <p className="font-handwriting text-lg text-primary">Quick setup</p>
          <h2 className="font-serif text-4xl leading-tight text-foreground md:text-5xl text-balance">
            Set up tracking in seconds
          </h2>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            Add your brand name, product, or any keyword. We scan Hacker News,
            Dev.to, and GitHub Discussions so you never miss a conversation.
          </p>
          <Link
            href="/login"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
          >
            Get started now <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="font-handwriting text-base text-muted-foreground">
            ↓ it&apos;s that easy — 2-day free trial on any plan
          </p>
        </div>
      </div>
    </section>
  )
}
