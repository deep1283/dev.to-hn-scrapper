import type { Metadata } from "next"

import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Platforms } from "@/components/landing/platforms"
import { Features } from "@/components/landing/features"
import { UseCases } from "@/components/landing/use-cases"
import { PricingSection } from "@/components/landing/pricing-section"
import { CTAFooter } from "@/components/landing/cta-footer"
import { PLAN_CONFIG } from "@/lib/plans"
import { resolveSiteUrl } from "@/lib/site-url"

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
