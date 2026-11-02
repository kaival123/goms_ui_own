import { Skeleton, SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton'

/** Suspense fallback for lazy-loaded routes (see router.tsx) — shown for the
 *  brief moment a route's own JS chunk is still downloading. A page-shaped skeleton
 *  (title, toolbar, rows) rather than a spinner, faded in after a short delay. */
export function RouteFallback() {
  return (
    <SkeletonGroup label="Loading…" className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="space-y-2.5">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-6 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <SkeletonRows rows={6} avatar />
    </SkeletonGroup>
  )
}
