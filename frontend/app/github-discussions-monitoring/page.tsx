import type { Metadata } from "next"

import { SourceMonitoringPage } from "@/components/seo/source-monitoring-page"
import { buildSourcePageMetadata, buildSourcePageStructuredData } from "@/lib/seo"

const faqs = [
  {
    question: "What does Signalze monitor in GitHub Discussions?",
    answer:
      "Signalze tracks GitHub Discussions mentions tied to your brand, product, competitors, and target keywords so teams can spot support demand, evaluation intent, and community feedback.",
  },
  {
    question: "Why monitor GitHub Discussions instead of only GitHub Issues?",
    answer:
      "GitHub Discussions often contain earlier buying questions, integration questions, and broader product evaluation conversations that never become issues.",
  },
  {
    question: "Who benefits most from GitHub Discussions monitoring?",
    answer:
      "Developer tool teams, open source maintainers, AI products, APIs, and technical SaaS companies benefit most because buyer and user intent often shows up directly in repository communities.",
  },
]

export const metadata: Metadata = buildSourcePageMetadata({
  slug: "github-discussions-monitoring",
  title: "GitHub Discussions Monitoring",
  description:
    "Monitor GitHub Discussions mentions for your product, brand, competitors, and keywords with Signalze. Catch community feedback and buyer intent earlier.",
  keywords: [
    "github discussions monitoring",
    "monitor github discussions",
    "github brand monitoring",
    "track github discussions mentions",
    "github discussions alerts",
  ],
  faqs,
})

const structuredData = buildSourcePageStructuredData({
  slug: "github-discussions-monitoring",
  title: "GitHub Discussions Monitoring",
  description:
    "Monitor GitHub Discussions mentions for your product, brand, competitors, and keywords with Signalze. Catch community feedback and buyer intent earlier.",
  keywords: [],
  faqs,
})

export default function GithubDiscussionsMonitoringPage() {
  return (
    <SourceMonitoringPage
      eyebrow="GitHub Discussions monitoring"
      title="Monitor GitHub Discussions for product feedback, support demand, and buying intent"
      summary="Signalze helps teams monitor GitHub Discussions so they can find brand mentions, competitor mentions, support questions, and community conversations before they become missed opportunities."
      intro="GitHub Discussions is one of the clearest places to see what technical users are evaluating, struggling with, recommending, or comparing. For dev tools and technical SaaS products, that makes GitHub Discussions monitoring a high-signal channel for support, product marketing, and research. Signalze centralizes those mentions in one dashboard."
      whatYouTrack={[
        "Brand and product mentions in GitHub Discussions threads",
        "Competitor mentions in evaluation or migration conversations",
        "Feature names, integrations, and workflow keywords",
        "Questions that signal buyer interest or support pressure",
        "Discussion context with matched terms and publication timing",
        "Mention counts alongside Hacker News and Dev.to in one place",
      ]}
      whyItMatters={[
        "Developer tool teams and open-source maintainers",
        "Technical SaaS, APIs, infra products, and AI products",
        "Teams that want earlier product feedback from repository communities",
      ]}
      faqs={faqs}
      ctaLabel="GitHub Discussions exposes real intent"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </SourceMonitoringPage>
  )
}
