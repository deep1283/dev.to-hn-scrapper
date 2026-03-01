"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

const navLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
  { href: "#features", label: "Features" },
]

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  return (
    <motion.header
      className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm"
      initial={reduceMotion ? undefined : { opacity: 0, y: -14 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={reduceMotion ? undefined : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
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

        <button
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            className="border-t border-border/40 bg-background px-6 pb-6 md:hidden"
            initial={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            animate={reduceMotion ? undefined : { height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={reduceMotion ? undefined : { duration: 0.22, ease: "easeOut" }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
