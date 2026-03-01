import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple pricing for monitoring mentions across HN, dev.to, and GitHub Discussions.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    url: "/pricing",
    title: "Signalze Pricing",
    description: "Choose the Signalze plan that fits your monitoring needs.",
  },
  twitter: {
    title: "Signalze Pricing",
    description: "Choose the Signalze plan that fits your monitoring needs.",
  },
}

export default function PricingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
