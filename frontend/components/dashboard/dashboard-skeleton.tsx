import { Skeleton } from "@/components/ui/skeleton"

export function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="p-2 sm:p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-7 w-28" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>
        </header>

        <section className="p-2 sm:p-3">
          <Skeleton className="h-10 w-40" />
          <div className="mt-3">
            <Skeleton className="h-4 w-16" />
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          </div>
        </section>

        <section className="p-2 sm:p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="px-1 py-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="mt-3 h-9 w-20" />
              </div>
            ))}
          </div>

          <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-28 shrink-0 rounded-full" />
            ))}
          </div>

          <div className="mt-5 space-y-6">
            <section className="rounded-2xl border border-border/50 bg-secondary/25 p-4">
              <Skeleton className="h-4 w-14" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                  <Skeleton key={index} className="h-44 rounded-xl" />
                ))}
              </div>
            </section>

            {Array.from({ length: 2 }, (_, index) => (
              <section key={index} className="rounded-2xl border border-border/40 p-4">
                <Skeleton className="h-4 w-36" />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 2 }, (_, cardIndex) => (
                    <Skeleton key={cardIndex} className="h-44 rounded-xl" />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
