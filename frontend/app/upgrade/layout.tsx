import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Upgrade",
  robots: {
    index: false,
    follow: false,
  },
}

export default function UpgradeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
