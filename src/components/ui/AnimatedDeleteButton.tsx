import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'fly' | 'close' | 'hold' | 'done'

const PARTICLES = Array.from({ length: 10 }, (_, i) => {
  const angle = (-165 + (i * 150) / 9) * (Math.PI / 180) // fans upward out of the bin
  const radius = 15 + (i % 3) * 5
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, size: i % 2 ? 2 : 3 }
})

// Timeline (seconds), tuned for smoothness over speed. Letters overlap heavily: each starts
// STAGGER after the previous one while that one is still mid-flight, so the word flows into
// the bin as one continuous ribbon of motion.
const LEAD = 0.2 // s before the first letter moves (the lid is already opening)
const STAGGER = 0.12 // s between consecutive letters
const FLIGHT = 0.95 // s each letter spends gliding into (or out of) the bin
const CLOSE = 0.6 // s the lid takes to close
const HOLD = 2 // s the letters stay hidden in the closed bin, exactly
const RETURN_LEAD = 0.3 // s the lid is open before the first letter comes back
const LIFT = 10 // px of gentle arc above the straight line to the bin
const SUCCESS_MS = 1800 // how long "Deleted" stays before the button resets
const SIZE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
// The bin artwork spans x 3–21, y 3–23 of its 24-unit grid; cropping the viewBox to that
// removes the empty margin so the icon sits flush with the button padding and label gap.
const VIEWBOX = '3 3 18 20'
const VIEWBOX_RATIO = 18 / 20

/** Gap between letters; shrinks for long labels so the whole word still flows in about a second and a half. */
const staggerFor = (n: number) => (n > 1 ? Math.min(STAGGER, 0.9 / (n - 1)) : 0)

/** CSS-style cubic-bezier easing (x1, y1, x2, y2), solved with Newton's method. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3
  const slope = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t * t
  return (x: number) => {
    if (x <= 0 || x >= 1) return Math.min(Math.max(x, 0), 1)
    let t = x
    for (let i = 0; i < 6; i++) {
      const d = slope(x1, x2, t)
      if (Math.abs(d) < 1e-6) break
      t -= (at(x1, x2, t) - x) / d
    }
    return at(y1, y2, Math.min(Math.max(t, 0), 1))
  }
}
const flow = bezier(0.45, 0.05, 0.35, 1) // soft start and landing, monotonic: no overshoot, so letters never bounce back
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

const LID: Variants = {
  idle: { rotate: 0, y: 0, transition: { duration: 0.2 } },
  hover: { rotate: -16, y: -1, transition: { type: 'spring', stiffness: 380, damping: 18 } },
  fly: { rotate: -48, y: -2, transition: { duration: 0.55, ease: [0.33, 0, 0.2, 1] } },
  close: { rotate: [-48, 2, 0], y: [-2, 0.4, 0], transition: { duration: CLOSE, ease: [0.45, 0.05, 0.35, 1], times: [0, 0.8, 1] } },
  hold: { rotate: 0, y: 0 },
  done: { rotate: 0, y: 0 },
}

const BIN: Variants = {
  idle: { scale: 1, opacity: 1, transition: { duration: 0.2 } },
  done: { scale: 0, opacity: 0, transition: { duration: 0.25 } },
}

const SUCCESS: Variants = {
  idle: { opacity: 0, y: 6, transition: { duration: 0.2 } },
  done: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 22, delay: 0.1 } },
}

type Variant = 'ghost' | 'outline' | 'solid' | 'studio'

const VARIANT: Record<Variant, string> = {
  ghost: 'text-crimson hover:bg-crimson/10',
  outline: 'border border-line bg-white text-crimson hover:border-crimson/50 hover:bg-crimson/10',
  solid: 'bg-crimson text-white hover:bg-crimson/90',
  // Insights Studio styles its own buttons (`studio-btn`); pass those classes in `className`.
  studio: '',
}

interface Props {
  /** May return a promise; with `showSuccess`, "Deleted" shows only if it resolves. */
  onDelete: () => void | Promise<unknown>
  variant?: Variant
  iconSize?: number
  'aria-label'?: string
  title?: string
  label?: string
  successLabel?: string
  /** Show the "Deleted" state after the animation. Turn off when `onDelete` only opens a confirmation. */
  showSuccess?: boolean
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

/** Delete button with a motion-graphics confirmation. On click the label's letters
 *  flow one after another (overlapping, no pauses) in an arc into the bin while the
 *  lid is open; the lid closes, they stay hidden for exactly two seconds, then the lid
 *  reopens and the letters flow back out in the same order and the label is restored.
 *  The button's width follows the visible letters frame by frame (it shrinks as they
 *  leave and grows as they return). `onDelete` runs only after the whole animation;
 *  clicks are ignored while it plays. Under `prefers-reduced-motion` it fires at once. */
export function AnimatedDeleteButton({
  onDelete, label = 'Delete', successLabel = 'Deleted', showSuccess = true, size = 'md', disabled, className,
  variant = 'ghost', iconSize = 15, 'aria-label': ariaLabel, title,
}: Props) {
  const iconW = Math.round(iconSize * VIEWBOX_RATIO * 10) / 10
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('idle')
  const [burst, setBurst] = useState(0)
  const busy = useRef(false)
  const timers = useRef<number[]>([])
  // Each letter has a slot (its layout width) and a glyph inside it (what flies).
  const slotRefs = useRef<(HTMLSpanElement | null)[]>([])
  const glyphRefs = useRef<(HTMLSpanElement | null)[]>([])
  const buttonRef = useRef<HTMLButtonElement>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const raf = useRef(0)
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete

  useEffect(() => () => {
    timers.current.forEach(window.clearTimeout)
    cancelAnimationFrame(raf.current)
  }, [])
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }

  const start = () => {
    if (busy.current || disabled) return
    busy.current = true
    if (reduce) {
      onDeleteRef.current()
      busy.current = false
      return
    }
    const btn = buttonRef.current
    const box = labelRef.current
    const slots = slotRefs.current.filter((el): el is HTMLSpanElement => !!el)
    const glyphs = glyphRefs.current
    const n = Math.max(slots.length, 1)
    const stagger = staggerFor(n)
    const gap = btn ? parseFloat(getComputedStyle(btn).columnGap) || 0 : 0
    const widths = slots.map(el => el.getBoundingClientRect().width)
    const labelW = box ? box.getBoundingClientRect().width : 0
    const successW = measureRef.current?.getBoundingClientRect().width ?? labelW

    // One timeline (seconds from click) drives letters, button width, lid and the hold.
    const lastIn = LEAD + (n - 1) * stagger + FLIGHT // the last letter is inside the bin
    const reopen = lastIn + CLOSE + HOLD // exactly HOLD seconds with the lid closed
    const returnStart = reopen + RETURN_LEAD
    const lastOut = returnStart + (n - 1) * stagger + FLIGHT // the last letter is home again
    const end = lastOut + CLOSE
    const events: [number, () => void][] = [
      [0, () => setPhase('fly')],
      [lastIn, () => { setPhase('close'); setBurst(b => b + 1) }],
      [lastIn + CLOSE, () => setPhase('hold')],
      [reopen, () => setPhase('fly')],
      [lastOut, () => setPhase('close')],
    ]
    let nextEvent = 0

    const t0 = performance.now()
    const tick = (now: number) => {
      const t = (now - t0) / 1000
      while (nextEvent < events.length && t >= events[nextEvent][0]) events[nextEvent++][1]()
      const ic = iconRef.current?.getBoundingClientRect()
      let total = 0
      slots.forEach((slot, i) => {
        const g = glyphs[i]
        // q: 0 = at home in the word, 1 = inside the bin. Leaves in order, returns in the same order.
        const out = clamp01((t - (LEAD + i * stagger)) / FLIGHT)
        const back = clamp01((t - (returnStart + i * stagger)) / FLIGHT)
        const q = back > 0 ? 1 - flow(back) : flow(out)
        // The slot shrinks while the letter is in the air, so the button follows the visible text.
        const w = widths[i] * (1 - flow(clamp01((q - 0.05) / 0.8)))
        slot.style.width = `${w}px`
        total += w
        if (!g || !ic) return
        const r = slot.getBoundingClientRect()
        const dx = ic.left + ic.width / 2 - (r.left + widths[i] / 2)
        const dy = ic.top + ic.height / 2 - (r.top + r.height / 2)
        const spin = (i % 2 ? 1 : -1) * (40 + i * 8)
        g.style.transform = `translate(${dx * q}px, ${dy * q - LIFT * 4 * q * (1 - q)}px) rotate(${spin * q}deg) scale(${1 - 0.88 * q ** 1.4})`
        g.style.opacity = String(q < 0.6 ? 1 : 1 - flow((q - 0.6) / 0.4))
      })
      // With no letters left the label gap goes too, leaving just the bin.
      if (box && labelW > 0) box.style.marginLeft = `${-gap * (1 - total / labelW)}px`
      if (t < end) {
        raf.current = requestAnimationFrame(tick)
        return
      }
      finish()
    }

    const clearStyles = () => {
      if (box) { box.style.transition = ''; box.style.width = ''; box.style.marginLeft = '' }
      slots.forEach(el => { el.style.width = '' })
      glyphs.forEach(g => { if (g) { g.style.transform = ''; g.style.opacity = '' } })
    }

    // Back to the original label, growing the button smoothly, then drop the inline styles.
    const resetFromSuccess = () => {
      if (box) {
        box.style.transition = `width 600ms ${SIZE_EASE}`
        box.style.width = `${labelW}px`
      }
      setPhase('idle')
      later(650, () => { clearStyles(); busy.current = false })
    }

    const settle = (ok: boolean) => {
      if (ok && showSuccess) {
        // The button grows from the label's width to exactly the width of the success label.
        if (box) {
          box.style.width = `${labelW}px`
          void box.offsetWidth // commit the starting width so the next change transitions
          box.style.transition = `width 650ms ${SIZE_EASE}`
          box.style.width = `${successW}px`
        }
        setPhase('done')
        later(SUCCESS_MS, resetFromSuccess)
      } else {
        clearStyles()
        setPhase('idle')
        busy.current = false
      }
    }

    function finish() {
      // Everything is home again: the original text is fully restored before the action runs.
      slots.forEach((el, i) => { el.style.width = `${widths[i]}px` })
      if (box) box.style.marginLeft = '0px'
      glyphs.forEach(g => { if (g) { g.style.transform = ''; g.style.opacity = '' } })
      const result = onDeleteRef.current()
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>).then(() => settle(true), () => settle(false))
      } else {
        settle(true)
      }
    }

    raf.current = requestAnimationFrame(tick)
  }

  const done = phase === 'done'
  return (
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      aria-disabled={phase !== 'idle' || undefined}
      initial="idle"
      animate={phase}
      whileHover={!reduce && phase === 'idle' && !disabled ? 'hover' : undefined}
      whileTap={!reduce && phase === 'idle' && !disabled ? { scale: 0.95 } : undefined}
      className={cn(
        'relative select-none',
        variant !== 'studio' && [
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium outline-none',
          'transition-colors duration-150 focus-visible:focus-ring',
          size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
          disabled && 'pointer-events-none opacity-40',
          done && variant !== 'solid' && 'bg-crimson/10',
        ],
        VARIANT[variant],
        phase !== 'idle' && 'cursor-default',
        className,
      )}
    >
      <span className="relative inline-flex items-center justify-center" style={{ width: iconW, height: iconSize }} ref={iconRef}>
        <motion.svg
          variants={BIN}
          viewBox={VIEWBOX}
          width={iconW}
          height={iconSize}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ overflow: 'visible' }}
        >
          <path d="M6 9l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11" />
          <path d="M10 13v5M14 13v5" />
          <motion.g variants={LID} style={{ originX: 0.1, originY: 1 }}>
            <path d="M4 7h16" />
            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </motion.g>
        </motion.svg>
        {/* Success tick replaces the bin. */}
        <motion.svg
          variants={SUCCESS}
          viewBox={VIEWBOX}
          width={iconW}
          height={iconSize}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="absolute inset-0"
        >
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={false}
            animate={{ pathLength: done ? 1 : 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
          />
        </motion.svg>
        {burst > 0 && PARTICLES.map((p, i) => (
          <motion.span
            key={`${burst}-${i}`}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full bg-current"
            style={{ width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{ x: p.x, y: p.y, scale: [0, 1.2, 0], opacity: [1, 1, 0] }}
            transition={{ duration: 1, ease: 'easeOut', delay: i * 0.02 }}
          />
        ))}
      </span>
      {/* The label box hugs the visible letters: each letter's slot shrinks as it leaves (and
          grows as it returns), so the button follows the text actually on screen. */}
      <span ref={labelRef} className="relative inline-flex whitespace-nowrap">
        <span className="sr-only">{label}</span>
        {[...label].map((ch, i) => (
          <span key={i} ref={el => { slotRefs.current[i] = el }} aria-hidden className="inline-flex min-w-0 shrink-0">
            <span ref={el => { glyphRefs.current[i] = el }} className="inline-block will-change-transform">
              {ch === ' ' ? ' ' : ch}
            </span>
          </span>
        ))}
        <span ref={measureRef} aria-hidden className="invisible absolute left-0 top-0 whitespace-nowrap">{successLabel}</span>
        <motion.span variants={SUCCESS} role="status" className="absolute left-0 top-0 flex h-full items-center whitespace-nowrap">
          {done ? successLabel : ''}
        </motion.span>
      </span>
    </motion.button>
  )
}
