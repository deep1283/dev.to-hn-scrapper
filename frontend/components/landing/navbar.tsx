"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#use-cases", label: "Use cases" },
  { href: "/pricing", label: "Pricing" },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-3" aria-label="Signalze home">
          <Image
            src="/logo.png"
            alt="Signalze"
            width={640}
            height={640}
            className="h-10 w-10 rounded-md object-cover"
            priority
          />
          <span className="font-serif text-2xl font-bold tracking-tight text-foreground">signalze</span>
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

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-foreground transition-colors hover:text-primary"
          >
            Log in
          </Link>
          <Link
            href="/pricing"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:brightness-95 active:scale-[0.98]"
          >
            Start now
          </Link>
        </div>

        <button
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-border/40 bg-background px-6 pb-6 md:hidden">
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
            <hr className="border-border/40" />
            <Link href="/login" className="text-sm font-medium text-foreground">
              Log in
            </Link>
            <Link
              href="/pricing"
              className="inline-block rounded-full bg-accent px-5 py-2.5 text-center text-sm font-semibold text-accent-foreground"
            >
              Start now
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
