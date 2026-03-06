import type { Metadata } from "next"

import { SourceMonitoringPage } from "@/components/seo/source-monitoring-page"
import { buildSourcePageMetadata, buildSourcePageStructuredData } from "@/lib/seo"

const faqs = [
  {
    question: "What does Signalze monitor on Hacker News?",
    answer:
      "Signalze tracks keyword matches across Hacker News discussions so teams can spot launches, feedback, competitor mentions, and product questions early.",
  },
  {
    question: "Why monitor Hacker News mentions?",
    answer:
      "Hacker News often surfaces high-signal product feedback, launch reactions, and technical buyer sentiment before those conversations spread elsewhere.",
  },
  {
    question: "Can I track competitor mentions on Hacker News too?",
    answer:
      "Yes. You can track your own product, competitor names, feature names, and problem-space keywords in the same dashboard.",
  },
]

export const metadata: Metadata = buildSourcePageMetadata({
  slug: "hacker-news-monitoring",
  title: "Hacker News Monitoring",
  description:
    "Monitor Hacker News mentions for your brand, product, competitors, and keywords with Signalze. Track discussions early and respond faster.",
  keywords: [
    "hacker news monitoring",
    "hacker news mentions",
    "monitor hacker news for brand",
    "track hacker news discussions",
    "hacker news alert tool",
  ],
  faqs,
})

const structuredData = buildSourcePageStructuredData({
  slug: "hacker-news-monitoring",
  title: "Hacker News Monitoring",
  description:
    "Monitor Hacker News mentions for your brand, product, competitors, and keywords with Signalze. Track discussions early and respond faster.",
  keywords: [],
  faqs,
})

export default function HackerNewsMonitoringPage() {
  return (
    <SourceMonitoringPage
      eyebrow="Hacker News monitoring"
      title="Monitor Hacker News mentions before they turn into momentum or criticism"
      summary="Signalze helps startup teams, founders, and marketers monitor Hacker News for product mentions, launch reactions, competitor references, and problem-space discussions."
      intro="Hacker News is one of the fastest places for technical buyers and founders to react to launches, pricing changes, AI products, developer tools, and infrastructure products. If you wait to hear about those threads manually, you are already late. Signalze turns Hacker News monitoring into a repeatable workflow with one dashboard for the discussions that matter."
      whatYouTrack={[
        "Brand name and company name mentions in Hacker News threads",
        "Product name, feature name, and launch keyword mentions",
        "Competitor mentions across the same discussions",
        "Problem-space phrases that signal buying intent or pain points",
        "Recent discussion context so you know where to respond first",
        "Matched keyword visibility inside the Signalze dashboard",
      ]}
      whyItMatters={[
        "Startups launching on Product Hunt, X, or directly into developer communities",
        "Founders who want early feedback from technical audiences",
        "Dev tools, AI tools, SaaS products, and infrastructure companies",
      ]}
      faqs={faqs}
      ctaLabel="Hacker News moves fast"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SourceMonitoringPage>
  )
}
