import Image from "next/image"
import { Star } from "lucide-react"

export function Testimonials() {
  return (
    <section className="px-6 py-20 md:py-32">
      <div className="mx-auto max-w-6xl text-center">
        <p className="font-handwriting text-lg text-primary">
          Testimonials
        </p>
        <h2 className="mt-3 font-serif text-4xl text-foreground md:text-5xl text-balance">
          Our users love Signalze
        </h2>

        <div className="mx-auto mt-12 max-w-xl">
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-accent text-accent" />
            ))}
          </div>
          <blockquote className="mt-6 font-serif text-xl leading-relaxed text-foreground italic">
            {'"'}We used to find out about HN threads mentioning us days later.
            With Signalze, we get pinged in Slack within minutes. It completely
            changed how we engage with our community.{'"'}
          </blockquote>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Image
              src="/images/testimonial-1.jpg"
              alt="Sarah Chen, founder of LaunchKit"
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Sarah Chen
              </p>
              <p className="text-xs text-muted-foreground">
                Founder at LaunchKit
              </p>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-8 md:grid-cols-4">
          <StatItem value="2,000+" label="Brands tracking" />
          <StatItem value="50,000+" label="Mentions caught" />
          <StatItem value="5 min" label="Avg. alert time" />
          <StatItem value="100%" label="Uptime SLA" />
        </div>
      </div>
    </section>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-serif text-3xl text-foreground">{value}</span>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
