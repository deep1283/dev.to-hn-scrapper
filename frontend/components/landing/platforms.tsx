import Image from "next/image"

export function Platforms() {
  return (
    <section className="px-6 py-20 md:py-32">
      <div className="mx-auto max-w-6xl text-center">
        <p className="font-handwriting text-lg text-primary">
          Monitor where it matters
        </p>
        <h2 className="mx-auto mt-3 max-w-lg font-serif text-4xl leading-tight text-foreground md:text-5xl text-balance">
          Track mentions where your audience lives
        </h2>

        {/* Floating orbital icons */}
        <div className="relative mx-auto mt-16 flex h-[320px] max-w-[400px] items-center justify-center md:h-[400px] md:max-w-[500px]">
          {/* Radial gradient background */}
          <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, hsl(72 73% 58% / 0.2), hsl(72 73% 58% / 0.05), transparent)" }} />
          <div className="absolute h-64 w-64 rounded-full bg-accent/15 blur-3xl md:h-80 md:w-80" />

          {/* Center dot */}
          <div className="absolute z-10 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg">
            <Image
              src="/logo.png"
              alt="Signalze"
              width={640}
              height={640}
              className="h-8 w-8 rounded-sm object-cover"
            />
          </div>

          {/* Orbit ring */}
          <div className="absolute orbit-ring orbit-r-mercury border border-border/40" />
          <div className="absolute orbit-ring orbit-r-earth border border-border/30" />
          <div className="absolute orbit-ring orbit-r-jupiter border border-border/20" />

          {/* Platform icons — positioned absolutely around the orbit */}
          <PlatformBubble
            label="Hacker News"
            angle={0}
            duration={16}
            orbitClass="orbit-r-mercury"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-[#ff6600]" aria-hidden="true">
              <path d="M0 0v24h24V0H0zm12.8 14.3V20h-1.6v-5.7L7 4h1.8l3.2 6.2L15.2 4H17l-4.2 10.3z" />
            </svg>
          </PlatformBubble>

          <PlatformBubble
            label="Dev.to"
            angle={120}
            duration={19}
            orbitClass="orbit-r-earth"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <rect x="1" y="1" width="22" height="22" rx="4" fill="#0A0A0A" />
              <path d="M7.6 9.4h1.4c1.5 0 2.4.9 2.4 2.6s-.9 2.6-2.4 2.6H7.6V9.4zm1.2 1.1v3h.3c.9 0 1.4-.5 1.4-1.5s-.5-1.5-1.4-1.5h-.3zm4.2-1.1h3.1v1.1h-1.9v1h1.8v1.1h-1.8v1h1.9v1.1H13V9.4zm4.1 0h1.3l1 3.2 1-3.2h1.3l-1.7 5.2h-1.2L17.1 9.4z" fill="#fff" />
            </svg>
          </PlatformBubble>

          <PlatformBubble
            label="GitHub"
            angle={240}
            duration={22}
            orbitClass="orbit-r-jupiter"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-[#111827]" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.68.5 12.08c0 5.12 3.29 9.46 7.86 11 .57.1.78-.25.78-.56v-2.1c-3.2.7-3.88-1.56-3.88-1.56-.52-1.35-1.28-1.71-1.28-1.71-1.05-.73.08-.72.08-.72 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.7 1.27 3.36.97.1-.76.4-1.27.73-1.56-2.55-.29-5.24-1.29-5.24-5.74 0-1.27.45-2.3 1.18-3.12-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.16 1.19a10.87 10.87 0 0 1 5.76 0c2.2-1.5 3.16-1.19 3.16-1.19.62 1.59.23 2.77.11 3.06.73.82 1.18 1.85 1.18 3.12 0 4.46-2.7 5.44-5.27 5.73.41.36.78 1.06.78 2.15v3.19c0 .31.2.66.79.55A11.6 11.6 0 0 0 23.5 12.08C23.5 5.68 18.35.5 12 .5z" />
            </svg>
          </PlatformBubble>

        </div>

        {/* Bottom card */}
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
          <p className="font-serif text-lg leading-snug text-card-foreground text-balance">
            Stay ahead of every conversation about your brand based on{" "}
            <span className="font-sans font-bold">real-time data</span> and{" "}
            <span className="font-sans font-bold">active discussions</span>
          </p>
          <a
            href="#"
            className="mt-4 inline-block rounded-full border border-border px-5 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-secondary"
          >
            Try it yourself
          </a>
        </div>
      </div>
    </section>
  )
}

function PlatformBubble({
  label,
  angle,
  duration,
  orbitClass,
  children,
}: {
  label: string
  angle: number
  duration: number
  orbitClass: string
  children: React.ReactNode
}) {
  return (
    <div className={`absolute left-1/2 top-1/2 z-20 orbit-spin ${orbitClass}`} style={{ animationDuration: `${duration}s` }}>
      <div style={{ transform: `rotate(${angle}deg) translateY(calc(var(--orbit-radius) * -1))` }}>
        <div className="orbit-counter group flex flex-col items-center gap-1.5" style={{ animationDuration: `${duration}s` }}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-card shadow-md transition-transform duration-300 group-hover:scale-110 md:h-14 md:w-14">
            {children}
          </div>
          <span className="text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 md:text-xs">
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}
