import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** How long a page stays in its skeleton state the first time it opens, then how long the fade back to real content takes. */
const SHOW_MS = 1500
const REVEAL_MS = 450

/** Pages already opened this session: a page shows its skeleton only the first time. */
const opened = new Set<string>()

/** Shows the page's own text and content as shimmering placeholders the first time it opens (see `.page-skeleton` in
 *  index.css): every line of text, icon, control and card keeps its real size and position, so the skeleton matches
 *  that page exactly, with no per-page markup. The page renders and fetches as usual underneath; nothing is delayed.
 *  Afterwards the real content fades in. */
export function FirstVisitSkeleton({ routeKey, className, children }: { routeKey: string; className?: string; children: ReactNode }) {
  const [phase, setPhase] = useState<'on' | 'reveal' | 'off'>(() => (opened.has(routeKey) ? 'off' : 'on'))
  useEffect(() => {
    if (phase === 'off') return
    opened.add(routeKey)
    const t = setTimeout(() => setPhase(phase === 'on' ? 'reveal' : 'off'), phase === 'on' ? SHOW_MS : REVEAL_MS)
    return () => clearTimeout(t)
  }, [phase, routeKey])

  return (
    <div
      className={cn(className, phase === 'on' && 'page-skeleton', phase === 'reveal' && 'page-skeleton-reveal')}
      aria-busy={phase === 'on' || undefined}
    >
      {children}
    </div>
  )
}
