import { type ReactNode, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import { SPRING_OVERLAY } from '@/lib/motion'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  /** Rich title shown in place of `title` (which still labels the dialog for assistive tech). */
  titleNode?: ReactNode
  /** Small label above the title. */
  eyebrow?: ReactNode
  /** Extra header content, beside the close button (e.g. a step indicator). */
  headerAside?: ReactNode
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  /** Desktop: cap the dialog at the window height and scroll its body (default). Pass false to let it grow the page. */
  fitViewport?: boolean
  className?: string
}

// `lg:`-prefixed so the max-width cap only ever applies at the desktop
// centered-modal breakpoint — below `lg` the sheet is intentionally
// full-bleed (see the mobile bottom-sheet variant below), not shrunk to one
// of these widths.
const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  md: 'lg:max-w-md',
  lg: 'lg:max-w-2xl',
  xl: 'lg:max-w-4xl',
}

export function Dialog({ open, onClose, title, titleNode, eyebrow, headerAside, description, children, footer, size = 'md', fitViewport = true, className }: Props) {
  // Below `lg`, every dialog built on this component presents as a bottom
  // sheet (full-bleed width, anchored to the bottom edge, internal scroll
  // capped at 90vh) instead of the small centered modal — an additive
  // responsive variant. At `lg` and up the centered-modal markup/animation
  // below is untouched from before this change.
  const isMobile = useMediaQuery('(max-width: 1023.98px)')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    // This wrapper is always mounted (never gated behind AnimatePresence)
    // specifically so `pointer-events` tracks the *live* `open` value: once
    // closed, the whole overlay stops intercepting clicks/hover immediately,
    // even while the backdrop/content below are still mid exit-fade. Without
    // this, the exiting backdrop keeps its full-screen onClick={onClose}
    // active for the whole fade-out duration, silently swallowing whatever
    // the user clicks next.
    <div
      data-canvas-ui
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 lg:items-start lg:p-8',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
    >
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-scrim/50"
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(6px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={onClose}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={cn(
                'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-paper shadow-pop lg:mt-8 lg:rounded-2xl',
                fitViewport ? 'lg:max-h-[calc(100dvh-6rem)]' : 'lg:max-h-none lg:overflow-visible',
                SIZE_CLASS[size],
                className,
              )}
              initial={isMobile ? { opacity: 0, y: 48 } : { opacity: 0, y: 24, scale: 0.96 }}
              animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={isMobile ? { opacity: 0, y: 48 } : { opacity: 0, y: 10, scale: 0.97 }}
              transition={SPRING_OVERLAY}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div className="min-w-0">
                  {eyebrow}
                  <h2 className="text-lg font-semibold text-ink-900">{titleNode ?? title}</h2>
                  {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {headerAside}
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded-md p-1 text-muted hover:bg-ink-900/[0.06] hover:text-ink"
                  >
                    <Icon name="X" />
                  </button>
                </div>
              </div>
              <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', !fitViewport && 'lg:overflow-visible')}>{children}</div>
              {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
