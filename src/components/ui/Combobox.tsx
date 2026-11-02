import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { Icon } from './Icon'
import { PopoverPanel } from './popover/PopoverPanel'
import { useRovingIndex } from './popover/useRovingIndex'
import { cn } from '@/lib/utils'
import { Avatar, type AvatarPerson } from './Avatar'

const EASE = [0.22, 1, 0.36, 1] as const

export interface ComboboxOption {
  value: string
  label: string
  searchText?: string
  /** When the option is a human, their face is shown beside the label. */
  person?: AvatarPerson
}

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  /** Shown when nothing is selected. */
  placeholder?: string
  /** Accessible name for the control. */
  'aria-label'?: string
  className?: string
  /** Renders a read-only display of the current selection instead of the
   *  editable control — for fields auto-filled from another selection. */
  disabled?: boolean
  /** Offers "Add “typed text”" when no option has that label; resolves to the new option's value. The caller reports
   *  a failure (a rejected promise just leaves the list open). */
  onCreate?: (label: string) => Promise<string>
}

/**
 * Typeahead select: an input that filters `options` as you type and commits a
 * value on pick. An empty value means nothing is selected (the placeholder
 * shows). Built on the same border/height tokens as Input/Select so it drops in
 * beside them. Closes on outside click / Escape; ↑/↓/Home/End move the active
 * option and Enter commits it.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  disabled = false,
  onCreate,
  ...aria
}: ComboboxProps) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value])
  const selectedLabel = selected?.label ?? ''
  const selectedPerson = selected?.person

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.searchText ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  // Closed: the input shows the committed selection. Open: it shows whatever the
  // user is typing (starting blank), while the current selection surfaces as the
  // placeholder so it never looks like the filter was cleared.
  const shown = open ? query : selectedLabel
  const placeholderText = open && selectedLabel ? selectedLabel : placeholder

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function commit(option: ComboboxOption) {
    onChange(option.value)
    setOpen(false)
    inputRef.current?.blur()
  }

  const typed = query.trim()
  const canCreate = !!onCreate && !!typed && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase())
  async function create() {
    if (!canCreate) return
    try { commit({ value: await onCreate!(typed), label: typed }) } catch { /* the caller shows why */ }
  }

  function clear() {
    onChange('')
    setOpen(false)
  }

  const roving = useRovingIndex({
    count: matches.length,
    resetKey: `${query}:${open}`,
    onCommit: (i) => { const opt = matches[i]; if (opt) commit(opt) },
    containerRef: listRef,
  })

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && canCreate && matches.length === 0) {
      e.preventDefault()
      void create()
      return
    }
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
      return
    }
    roving.onKeyDown(e)
  }

  if (disabled) {
    return (
      <div className={cn('flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[13px] text-ink-700', selectedPerson && 'pl-1.5', className)}>
        {selectedPerson && <Avatar person={selectedPerson} size="xs" />}
        {selectedLabel || <span className="text-muted/70">{placeholder}</span>}
      </div>
    )
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        {selectedPerson && !open && (
          <Avatar person={selectedPerson} size="xs" className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2" />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={shown}
          placeholder={placeholderText}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'h-9 w-full rounded-xl border bg-white pl-3 pr-9 text-[13px] text-ink shadow-sm outline-none placeholder:text-muted/70',
            'transition-[border-color,box-shadow] duration-200 hover:border-goms-sky/60',
            open ? 'border-goms-sky ring-4 ring-goms-sky/15' : 'border-line',
            'focus:border-goms-sky focus:ring-4 focus:ring-goms-sky/15',
            selectedPerson && !open && 'pl-9',
          )}
          {...aria}
        />
        {value && !open ? (
          <button
            type="button"
            aria-label="Clear filter"
            onClick={clear}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-ink-900"
          >
            <Icon name="X" size={13} />
          </button>
        ) : (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute right-2.5 top-1/2 -mt-[7px] text-muted transition-[transform,color] duration-300 ease-out',
              open && 'rotate-180 text-goms-sky',
            )}
          >
            <Icon name="ChevronDown" size={14} />
          </span>
        )}
      </div>

      <PopoverPanel open={open} anchorRef={rootRef} onClose={() => setOpen(false)} matchAnchorWidth maxPanelHeight={240}>
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
            {canCreate && (
              <li>
                <button type="button" onClick={() => void create()} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-ink-900 hover:bg-ink-900/[0.06] lg:min-h-0">
                  <Icon name="Plus" size={13} /> Add “{typed}”
                </button>
              </li>
            )}
            {matches.length === 0 ? (
              !canCreate && <li className="px-2.5 py-2 text-[13px] text-muted">No matches</li>
            ) : (
              matches.map((o, i) => {
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
                      {o.person && <Avatar person={o.person} size="xs" className="relative" />}
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
              })
            )}
          </motion.ul>
        )}
      </PopoverPanel>
    </div>
  )
}
