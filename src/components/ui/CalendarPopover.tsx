import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { Icon } from './Icon'
import { PopoverPanel } from './popover/PopoverPanel'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })
const DAY_LABEL = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

const pad = (n: number) => String(n).padStart(2, '0')
/** `yyyy-mm-dd` for a local date (never via UTC, which would shift the day). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseDay = (s: string): Date | null =>
  /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : null
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1)

/** The six weeks (42 days, Sunday first) that cover a month. */
function monthCells(view: Date): Date[] {
  const start = addDays(view, -view.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

interface Props {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** The chosen day as `yyyy-mm-dd`, or ''. */
  value: string
  /** Earliest / latest pickable day, as `yyyy-mm-dd`. */
  min?: string
  max?: string
  onPick: (day: string) => void
  onClear: () => void
  /** Shows a time box under the calendar (date-and-time fields); the calendar then stays open after a day is picked. */
  time?: { value: string; onChange: (time: string) => void }
}

/** The app's own date picker: a month grid that slides between months, a selection that springs in, and a today
 *  ring. It replaces the browser's picker, which cannot be styled. Keyboard: arrows move by day / week,
 *  Home / End to the start / end of the week, PageUp / PageDown by month, Enter or Space picks, Esc closes. */
export function CalendarPopover({ open, onClose, anchorRef, value, min, max, onPick, onClear, time }: Props) {
  const titleId = useId()
  const gridRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => new Date(), [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const selected = parseDay(value)
  const minDay = min ? parseDay(min) : null
  const maxDay = max ? parseDay(max) : null

  const [view, setView] = useState(() => firstOfMonth(selected ?? today))
  const [direction, setDirection] = useState(1)
  const [focusDay, setFocusDay] = useState(() => dayKey(selected ?? today))

  // Each time it opens it starts on the chosen day's month (or this month).
  useEffect(() => {
    if (!open) return
    const start = parseDay(value) ?? new Date()
    setView(firstOfMonth(start))
    setFocusDay(dayKey(start))
    setDirection(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Keep keyboard focus on the day the arrows have reached.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus())
    return () => cancelAnimationFrame(id)
  }, [open, focusDay, view])

  const outOfRange = (d: Date) => (minDay ? d < minDay : false) || (maxDay ? d > maxDay : false)
  const cells = useMemo(() => monthCells(view), [view])

  function showMonth(next: Date) {
    setDirection(next > view ? 1 : -1)
    setView(firstOfMonth(next))
  }
  function moveFocus(next: Date) {
    setFocusDay(dayKey(next))
    if (next.getMonth() !== view.getMonth() || next.getFullYear() !== view.getFullYear()) showMonth(next)
  }
  function onGridKeyDown(e: KeyboardEvent) {
    const current = parseDay(focusDay) ?? today
    const steps: Record<string, Date> = {
      ArrowLeft: addDays(current, -1), ArrowRight: addDays(current, 1), ArrowUp: addDays(current, -7), ArrowDown: addDays(current, 7),
      Home: addDays(current, -current.getDay()), End: addDays(current, 6 - current.getDay()),
      PageUp: new Date(current.getFullYear(), current.getMonth() - 1, current.getDate()),
      PageDown: new Date(current.getFullYear(), current.getMonth() + 1, current.getDate()),
    }
    const next = steps[e.key]
    if (!next) return
    e.preventDefault()
    moveFocus(next)
  }

  const pick = (d: Date) => {
    if (outOfRange(d)) return
    onPick(dayKey(d))
    if (!time) onClose()
  }
  const todayDisabled = outOfRange(today)

  return (
    <PopoverPanel open={open} anchorRef={anchorRef} onClose={onClose} gap={6} maxPanelHeight={480}>
      {() => (
        <motion.div
          role="dialog"
          aria-labelledby={titleId}
          data-canvas-ui
          className="w-[19.5rem] rounded-2xl border border-line/70 bg-paper/95 p-3 shadow-pop backdrop-blur-md"
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.24, ease: EASE }}
          style={{ transformOrigin: 'top left' }}
        >
          <div className="mb-2 flex items-center justify-between">
            <motion.h2
              id={titleId}
              key={dayKey(view)}
              className="px-1 text-[14px] font-semibold text-ink-900"
              initial={{ opacity: 0, x: direction * 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              aria-live="polite"
            >
              {MONTH_LABEL.format(view)}
            </motion.h2>
            <div className="flex items-center gap-1">
              <NavButton label="Previous month" onClick={() => showMonth(addMonths(view, -1))}><Icon name="ChevronLeft" size={16} /></NavButton>
              <NavButton label="Next month" onClick={() => showMonth(addMonths(view, 1))}><Icon name="ChevronRight" size={16} /></NavButton>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted" aria-hidden>
            {WEEKDAYS.map((d) => <span key={d} className="py-1">{d}</span>)}
          </div>

          <div ref={gridRef} role="grid" aria-label={MONTH_LABEL.format(view)} onKeyDown={onGridKeyDown} className="overflow-hidden">
            <motion.div
              key={dayKey(view)}
              className="grid grid-cols-7 gap-y-0.5"
              initial={{ opacity: 0, x: direction * 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              {cells.map((d, i) => {
                const k = dayKey(d)
                const inMonth = d.getMonth() === view.getMonth()
                const isSelected = !!selected && k === dayKey(selected)
                const isToday = k === dayKey(today)
                const disabled = outOfRange(d)
                return (
                  <motion.button
                    key={k}
                    type="button"
                    role="gridcell"
                    data-day={k}
                    aria-label={DAY_LABEL.format(d)}
                    aria-selected={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    disabled={disabled}
                    tabIndex={k === focusDay ? 0 : -1}
                    onClick={() => pick(d)}
                    className={cn(
                      'relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl text-[13px] tabular-nums outline-none transition-colors duration-150',
                      'focus-visible:ring-2 focus-visible:ring-goms-sky',
                      inMonth ? 'text-ink' : 'text-muted/55',
                      !isSelected && !disabled && 'hover:bg-goms-sky/15',
                      isToday && !isSelected && 'font-semibold text-goms-navy ring-1 ring-inset ring-goms-sky/70',
                      disabled && 'pointer-events-none opacity-30',
                    )}
                    initial={{ opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.22, ease: EASE, delay: Math.floor(i / 7) * 0.025 + (i % 7) * 0.006 }}
                    whileTap={disabled ? undefined : { scale: 0.9 }}
                  >
                    {isSelected && (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-xl bg-ink-900 shadow-sm"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                      />
                    )}
                    <span className={cn('relative', isSelected && 'font-semibold text-paper')}>{d.getDate()}</span>
                  </motion.button>
                )
              })}
            </motion.div>
          </div>

          {time && (
            <label className="mt-2 flex items-center justify-between gap-3 border-t border-line/70 pt-2 text-[12px] text-muted">
              Time
              <input
                type="time"
                value={time.value}
                onChange={(e) => time.onChange(e.target.value)}
                className="h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-goms-sky focus:ring-4 focus:ring-goms-sky/15"
              />
            </label>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-line/70 pt-2">
            <FooterButton onClick={() => { onClear(); onClose() }}>Clear</FooterButton>
            {time
              ? <FooterButton strong onClick={onClose}>Done</FooterButton>
              : <FooterButton disabled={todayDisabled} onClick={() => pick(today)}>Today</FooterButton>}
          </div>
        </motion.div>
      )}
    </PopoverPanel>
  )
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-goms-sky/15 hover:text-goms-navy focus-visible:ring-2 focus-visible:ring-goms-sky"
    >
      {children}
    </button>
  )
}

function FooterButton({ children, onClick, disabled, strong }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; strong?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-goms-sky disabled:pointer-events-none disabled:opacity-35',
        strong ? 'bg-ink-900 text-paper hover:bg-ink-800' : 'text-goms-navy hover:bg-goms-sky/15',
      )}
    >
      {children}
    </button>
  )
}
