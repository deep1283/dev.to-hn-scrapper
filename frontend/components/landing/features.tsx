import { Bell, BarChart3, Zap, Globe, Shield, Smartphone } from "lucide-react"
import { Reveal, Stagger, StaggerItem } from "@/components/landing/reveal"

const features = [
  {
    icon: Bell,
    title: "Instant alerts",
    description:
      "Get notified in your dashboard and Slack the moment your brand is mentioned.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: BarChart3,
    title: "Mention context",
    description:
      "See matched terms, source details, and publish time for every mention.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: Zap,
    title: "Real-time tracking",
    description:
      "Mentions are captured from Hacker News, Dev.to, and GitHub Discussions.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: Globe,
    title: "Keyword monitoring",
    description:
      "Track your brand, competitors, or any keyword across developer communities.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Shield,
    title: "Competitor tracking",
    description:
      "Keep tabs on what people say about your competitors too.",
    color: "bg-rose-50 text-rose-600",
  },
  {
    icon: Smartphone,
    title: "Mobile-ready dashboard",
    description:
      "Check your mentions from anywhere with a fully responsive dashboard.",
    color: "bg-teal-50 text-teal-600",
  },
]

export function Features() {
  return (
    <section id="features" className="px-4 py-16 sm:px-6 sm:py-20 md:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-center font-handwriting text-lg text-primary">
            Features
          </p>
          <h2 className="mx-auto mt-3 max-w-lg text-center font-serif text-3xl leading-tight text-foreground md:text-5xl text-balance">
            Simple, yet with all the tools you need
          </h2>
        </Reveal>

        <Stagger className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" delayChildren={0.08}>
          {features.map((feature) => (
            <StaggerItem key={feature.title}>
              <div className="group rounded-2xl bg-card p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.color}`}
                >
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-card-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
