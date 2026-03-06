import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-neutral-200/80 dark:bg-neutral-800/70', className)}
      {...props}
    />
  )
}

export { Skeleton }
