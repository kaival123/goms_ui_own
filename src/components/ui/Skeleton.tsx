import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** One placeholder block with a light sweeping shimmer (see `.skeleton` in index.css).
 *  Colors come from theme tokens, so it works in light and dark. Decorative: wrap a set of
 *  them in `SkeletonGroup` so assistive tech hears a single "loading" status instead. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn('skeleton h-3 w-full', className)} style={style} />
}

/** Loading text with a highlight sweeping across the letters (see `.shimmer-text` in index.css). Takes the colour of
 *  the surrounding text, so it works in light and dark and on any background. */
export function ShimmerText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('shimmer-text', className)}>{children}</span>
}

/** Announces the loading state once (`label` is read out, and shown shimmering above the placeholder unless `caption` is off) and fades the whole
 *  placeholder in after a short delay, so fast loads never flash a skeleton. */
export function SkeletonGroup({ label, className, caption = true, children }: { label: string; className?: string; caption?: boolean; children: ReactNode }) {
  return (
    <motion.div
      role="status"
      aria-busy="true"
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: 0.12, ease: 'easeOut' }}
    >
      {caption
        ? <div className="mb-3 text-xs font-medium text-muted"><ShimmerText>{label}</ShimmerText></div>
        : <span className="sr-only">{label}</span>}
      {children}
    </motion.div>
  )
}

/** Fades + lifts each child in turn so a placeholder list settles in rather than popping. */
function Staggered({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.15 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

// Slightly different line lengths so rows read as text, not a uniform stripe.
const WIDTHS = ['72%', '56%', '84%', '48%', '66%', '78%']

/** List rows: an optional round avatar, a title line and a shorter subtitle line. */
export function SkeletonRows({ rows = 5, avatar = false, className }: { rows?: number; avatar?: boolean; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Staggered key={i} index={i} className="flex items-center gap-3">
          {avatar && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: WIDTHS[i % WIDTHS.length] }} />
            <Skeleton className="h-2.5" style={{ width: `calc(${WIDTHS[(i + 3) % WIDTHS.length]} * 0.7)` }} />
          </div>
        </Staggered>
      ))}
    </div>
  )
}

/** Table body placeholder: a header bar then `rows` rows of `cols` cells. */
export function SkeletonTable({ rows = 6, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line', className)} aria-hidden>
      <div className="flex gap-4 px-4 py-3">
        {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-2.5 flex-1 opacity-70" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <Staggered key={r} index={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-3 flex-1" style={{ maxWidth: c === 0 ? undefined : `${60 + ((r + c) % 3) * 12}%` }} />
          ))}
        </Staggered>
      ))}
    </div>
  )
}

/** A row of stat/summary cards. */
export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-3', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Staggered key={i} index={i} className="space-y-3 rounded-xl border border-line bg-white p-4">
          <Skeleton className="h-2.5 w-1/3" />
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-2.5 w-2/3" />
        </Staggered>
      ))}
    </div>
  )
}
