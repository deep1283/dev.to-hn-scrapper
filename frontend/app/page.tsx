import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Platforms } from "@/components/landing/platforms"
import { Features } from "@/components/landing/features"
import { UseCases } from "@/components/landing/use-cases"
import { CTAFooter } from "@/components/landing/cta-footer"

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Signalze",
      url: appUrl,
      description: "Monitor HN, dev.to and GitHub Discussions for your brand or keywords.",
    },
    {
      "@type": "SoftwareApplication",
      name: "Signalze",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: appUrl,
      description: "Monitor HN, dev.to and GitHub Discussions for your brand or keywords. Engage early, grow faster.",
      offers: [
        {
          "@type": "Offer",
          price: "5",
          priceCurrency: "USD",
          name: "Starter",
        },
        {
          "@type": "Offer",
          price: "9",
          priceCurrency: "USD",
          name: "Pro",
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
      <CTAFooter />
    </main>
  )
}
