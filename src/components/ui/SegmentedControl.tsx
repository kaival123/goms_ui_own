import { useId } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** A small pick-one switch whose white pill slides to the chosen option. */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className="neu-inset flex rounded-lg p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)}
            className={cn('relative h-8 rounded-md px-2.5 text-[12px] font-medium transition-colors focus-visible:focus-ring', active ? 'text-ink-900' : 'text-muted hover:text-ink')}
          >
            {active && (
              <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-md bg-white shadow-sm" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
