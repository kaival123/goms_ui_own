import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/** A number that counts up from zero when it first appears (and from its old value when it changes). Under reduced
 *  motion, and in tests, it just shows the value. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), duration = 1.1, className }: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const still = useReducedMotion() || import.meta.env.MODE === 'test' || !Number.isFinite(value)
  const [shown, setShown] = useState(still ? value : 0)
  const from = useRef(still ? value : 0)
  useEffect(() => {
    if (still) { setShown(value); return }
    const controls = animate(from.current, value, {
      duration, ease: [0.16, 1, 0.3, 1],
      onUpdate: (n) => { from.current = n; setShown(n) },
    })
    return () => controls.stop()
  }, [value, duration, still])
  return <span className={className} aria-label={format(value)}>{format(still ? value : shown)}</span>
}
