"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const navLinks = [
  { href: "#pricing", label: "Pricing" },
  { href: "/pilot-testing", label: "Pilot Testing" },
  { href: "/contact", label: "Contact" },
  { href: "#features", label: "Features" },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Link href="/" className="inline-flex items-center gap-3" aria-label="Signalze home">
          <Image
            src="/logo.png"
            alt="Signalze"
            width={640}
            height={640}
            className="h-10 w-10 rounded-md object-cover"
            priority
          />
          <span className="font-serif text-lg font-bold tracking-tight text-foreground sm:text-2xl">signalze</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <button
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileOpen ? (
        <div className="border-t border-border/40 bg-background px-4 pb-6 sm:px-6 md:hidden">
          <div className="flex flex-col gap-4 pt-5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}
