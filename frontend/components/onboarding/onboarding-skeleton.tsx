import { Skeleton } from "@/components/ui/skeleton"

export function OnboardingSkeleton() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-6 w-28" />
          <Skeleton className="mt-2 h-10 w-56 sm:w-72" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        </header>

        <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl sm:w-24" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index}>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="mt-2 h-7 w-24" />
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-end">
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
      </div>
    </main>
  )
}
