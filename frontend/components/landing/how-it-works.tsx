import Image from "next/image"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { Reveal } from "@/components/landing/reveal"

const AUTH_ENTRY_PATH = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "/sign-in" : "/login"

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-20 md:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <Reveal className="order-2 md:order-1" y={24}>
          <div className="relative mx-auto flex justify-center">
            <Image
              src="/images/sketch_service_mentions.png"
              alt="Signalze app sketch showing mentions feed and notification settings"
              width={380}
              height={520}
              className="image-blend-clean h-auto w-full max-w-[280px] sm:max-w-[340px]"
              style={{ transform: "rotate(2deg)" }}
            />
          </div>
        </Reveal>

        {/* Text */}
        <Reveal className="order-1 flex flex-col gap-6 md:order-2" delay={0.08}>
          <p className="font-handwriting text-lg text-primary">Quick setup</p>
          <h2 className="font-serif text-4xl leading-tight text-foreground md:text-5xl text-balance">
            Set up tracking in seconds
          </h2>
          <p className="max-w-md leading-relaxed text-muted-foreground">
            Add your brand name, product, or any keyword. We scan Hacker News,
            Dev.to, and GitHub Discussions so you never miss a conversation.
          </p>
          <Link
            href={AUTH_ENTRY_PATH}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
          >
            Get started now <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="font-handwriting text-base text-muted-foreground">
            ↓ it&apos;s that easy - 5-day free trial on any plan
          </p>
        </Reveal>
      </div>
    </section>
  )
}
