import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign Up",
  robots: {
    index: false,
    follow: false,
  },
}

export default function SignUpLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
