import type { Metadata } from "next"
import dynamic from "next/dynamic"

import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Features } from "@/components/landing/features"
import { PLAN_CONFIG } from "@/lib/plans"
import { resolveSiteUrl } from "@/lib/site-url"

const Platforms = dynamic(
  () => import("@/components/landing/platforms").then((mod) => mod.Platforms),
  { loading: () => <LandingSectionPlaceholder heightClassName="h-[520px]" /> },
)
const UseCases = dynamic(
  () => import("@/components/landing/use-cases").then((mod) => mod.UseCases),
  { loading: () => <LandingSectionPlaceholder heightClassName="h-[420px]" /> },
)
const PricingSection = dynamic(
  () => import("@/components/landing/pricing-section").then((mod) => mod.PricingSection),
  { loading: () => <LandingSectionPlaceholder heightClassName="h-[420px]" /> },
)
const CTAFooter = dynamic(
  () => import("@/components/landing/cta-footer").then((mod) => mod.CTAFooter),
  { loading: () => <LandingSectionPlaceholder heightClassName="h-[260px]" /> },
)

export const metadata: Metadata = {
  title: "Brand Monitoring for Hacker News, Dev.to, and GitHub Discussions",
  description:
    "Signalze helps you monitor Hacker News, Dev.to, and GitHub Discussions for brand mentions, competitor mentions, and high-intent keyword discussions.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    url: "/",
    title: "Signalze | Brand Monitoring for HN, Dev.to, and GitHub Discussions",
    description:
      "Monitor brand mentions, competitor mentions, and keyword discussions across Hacker News, Dev.to, and GitHub Discussions.",
  },
  twitter: {
    title: "Signalze | Brand Monitoring for HN, Dev.to, and GitHub Discussions",
    description:
      "Monitor brand mentions, competitor mentions, and keyword discussions across Hacker News, Dev.to, and GitHub Discussions.",
  },
}

const appUrl = resolveSiteUrl()

function parsePrice(value: string): string {
  const matched = value.match(/\d+(\.\d+)?/)
  return matched?.[0] ?? "0"
}

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Signalze",
      url: appUrl,
      description: "Monitor HN, Dev.to and GitHub Discussions for your brand, competitors, or any keyword in your niche.",
    },
    {
      "@type": "Organization",
      name: "Signalze",
      url: appUrl,
      logo: `${appUrl}/logo.png`,
      sameAs: ["https://x.com/deepmishra1283"],
    },
    {
      "@type": "SoftwareApplication",
      name: "Signalze",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: appUrl,
      description: "Monitor HN, Dev.to and GitHub Discussions for your brand, competitors, or any keyword in your niche. Engage early, grow faster.",
      offers: [
        {
          "@type": "Offer",
          price: parsePrice(PLAN_CONFIG.starter_9.price),
          priceCurrency: "USD",
          name: PLAN_CONFIG.starter_9.name,
        },
        {
          "@type": "Offer",
          price: parsePrice(PLAN_CONFIG.growth_15.price),
          priceCurrency: "USD",
          name: PLAN_CONFIG.growth_15.name,
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What does Signalze monitor?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Signalze monitors Hacker News, Dev.to, and GitHub Discussions for brand mentions, competitor mentions, and important keyword discussions.",
          },
        },
        {
          "@type": "Question",
          name: "Who is Signalze for?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Signalze is built for founders, developer marketing teams, DevRel teams, and startups that want to catch relevant conversations early.",
          },
        },
        {
          "@type": "Question",
          name: "Can Signalze track competitors too?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. You can monitor your brand, your competitors, and any category keywords in the same dashboard.",
          },
        },
      ],
    },
  ],
}

function LandingSectionPlaceholder({ heightClassName }: { heightClassName: string }) {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 md:py-32">
      <div className={`mx-auto max-w-6xl rounded-3xl border border-border/40 bg-card/40 ${heightClassName}`} />
    </section>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Navbar />
      <Hero />
      <HowItWorks />
      <Platforms />
      <Features />
      <UseCases />
      <PricingSection />
      <CTAFooter />
    </main>
  )
}
