import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { Icon } from './Icon'
import { PopoverPanel } from './popover/PopoverPanel'
import { useRovingIndex } from './popover/useRovingIndex'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const

export interface SelectMenuOption {
  value: string
  label: string
}

interface SelectMenuProps {
  value: string
  onChange: (value: string) => void
  options: SelectMenuOption[]
  /** Accessible name for the control. */
  'aria-label'?: string
  /** Shown when `value` matches no option. */
  placeholder?: string
  disabled?: boolean
  /** Classes for the wrapper (width, margins). */
  className?: string
  /** Classes for the trigger button (height, text size). */
  buttonClassName?: string
}

/**
 * A short pick-one list with the same look and motion as `Combobox` (glowing focus, turning chevron, a
 * highlight that glides between options, a check on the chosen one) but without the typing, for lists of a
 * handful of choices. It replaces the browser's own `<select>` list, which cannot be styled.
 * Keyboard: Enter / Space / ↓ open it; ↑ ↓ Home End move; Enter / Space choose; Esc closes.
 */
export function SelectMenu({
  value, onChange, options, placeholder = 'Select…', disabled = false, className, buttonClassName, ...aria
}: SelectMenuProps) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const selected = options.find((o) => o.value === value)

  function commit(option: SelectMenuOption) {
    onChange(option.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  const roving = useRovingIndex({
    count: options.length,
    resetKey: open,
    onCommit: (i) => { const option = options[i]; if (option) commit(option) },
    containerRef: listRef,
  })
  // Opening lands on the current choice rather than the first row.
  useEffect(() => {
    if (open) roving.setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return }
    if (e.key === 'Tab') { setOpen(false); return }
    if (e.key === ' ') {
      e.preventDefault()
      const option = options[roving.active]
      if (option) commit(option)
      return
    }
    roving.onKeyDown(e)
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-xl border bg-white pl-3 pr-2.5 text-left text-[13px] text-ink shadow-sm outline-none',
          'transition-[border-color,box-shadow,opacity] duration-200 hover:border-goms-sky/60',
          open ? 'border-goms-sky ring-4 ring-goms-sky/15' : 'border-line',
          'focus-visible:border-goms-sky focus-visible:ring-4 focus-visible:ring-goms-sky/15',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line',
          buttonClassName,
        )}
        {...aria}
      >
        <span className={cn('min-w-0 truncate', !selected && 'text-muted/70')}>{selected?.label ?? placeholder}</span>
        <span
          aria-hidden
          className={cn('shrink-0 text-muted transition-[transform,color] duration-300 ease-out', open && 'rotate-180 text-goms-sky')}
        >
          <Icon name="ChevronDown" size={14} />
        </span>
      </button>

      <PopoverPanel open={open} anchorRef={rootRef} onClose={() => setOpen(false)} matchAnchorWidth maxPanelHeight={260}>
        {({ maxHeight }) => (
          <motion.ul
            ref={listRef}
            role="listbox"
            data-canvas-ui
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ maxHeight }}
            className="w-full overflow-y-auto scrollbar-thin rounded-2xl border border-line/70 bg-paper/95 p-1.5 shadow-pop backdrop-blur-md"
          >
            {options.map((o, i) => {
              const chosen = o.value === value
              return (
                <motion.li
                  key={o.value}
                  data-roving-index={i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: EASE, delay: Math.min(i, 10) * 0.018 }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    onMouseEnter={() => roving.setActive(i)}
                    onClick={() => commit(o)}
                    className={cn(
                      'relative flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[13px] transition-colors duration-150 lg:min-h-0 lg:py-2',
                      chosen ? 'font-semibold text-goms-navy' : 'text-ink',
                    )}
                  >
                    {/* One pill shared by all options: it glides to whichever is active. */}
                    {i === roving.active && (
                      <motion.span
                        layoutId={`${uid}-active`}
                        className="absolute inset-0 rounded-xl bg-goms-sky/15"
                        transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                      />
                    )}
                    <span className="relative min-w-0 flex-1 truncate">{o.label}</span>
                    {chosen && (
                      <motion.span
                        className="relative text-goms-sky"
                        initial={{ scale: 0, rotate: -30 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                      >
                        <Icon name="Check" size={14} strokeWidth={2.6} />
                      </motion.span>
                    )}
                  </button>
                </motion.li>
              )
            })}
          </motion.ul>
        )}
      </PopoverPanel>
    </div>
  )
}
