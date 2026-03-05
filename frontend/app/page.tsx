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
  alternates: {
    canonical: "/",
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
