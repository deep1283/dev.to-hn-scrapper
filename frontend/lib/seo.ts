import type { Metadata } from "next"

import { resolveSiteUrl } from "@/lib/site-url"

export type SeoFaqItem = {
  question: string
  answer: string
}

type SourceSeoConfig = {
  slug: string
  title: string
  description: string
  keywords: string[]
  faqs: SeoFaqItem[]
}

const appUrl = resolveSiteUrl()

export function buildSourcePageMetadata(config: SourceSeoConfig): Metadata {
  return {
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    alternates: {
      canonical: `/${config.slug}`,
    },
    openGraph: {
      url: `/${config.slug}`,
      title: `${config.title} | Signalze`,
      description: config.description,
      type: "article",
    },
    twitter: {
      title: `${config.title} | Signalze`,
      description: config.description,
    },
  }
}

export function buildSourcePageStructuredData(config: SourceSeoConfig) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: config.title,
        description: config.description,
        url: `${appUrl}/${config.slug}`,
      },
      {
        "@type": "FAQPage",
        mainEntity: config.faqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  }
}
