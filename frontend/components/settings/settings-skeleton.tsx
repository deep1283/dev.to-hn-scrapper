import { Skeleton } from "@/components/ui/skeleton"

export function SettingsSkeleton() {
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
              <Skeleton className="hidden h-10 w-36 rounded-full md:inline-flex" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
          </div>
          <Skeleton className="mt-3 h-9 w-32 rounded-full md:hidden" />
        </header>

        <section className="p-2 sm:p-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="mt-2 h-4 w-44" />

          <div className="mt-8 flex max-w-4xl flex-col gap-10">
            <section>
              <Skeleton className="h-9 w-36" />
              <Skeleton className="mt-2 h-4 w-24" />
              <div className="mt-4 grid grid-cols-1 gap-4 sm:max-w-xs">
                <div>
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="mt-2 h-9 w-20" />
                </div>
              </div>
              <Skeleton className="mt-4 h-4 w-40" />
              <Skeleton className="mt-2 h-4 w-48" />
              <Skeleton className="mt-5 h-10 w-full rounded-full sm:w-32" />
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-9 w-36" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="mt-4 h-16 rounded-xl" />
              <Skeleton className="mt-4 h-4 w-72 max-w-full" />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl sm:w-28" />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Skeleton className="h-10 w-full rounded-full sm:w-36" />
                <Skeleton className="h-10 w-full rounded-full sm:w-28" />
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="mt-2 h-4 w-72 max-w-full" />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl sm:w-24" />
              </div>
              <Skeleton className="mt-3 h-10 w-24 rounded-full" />
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-8 w-24 rounded-full" />
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
