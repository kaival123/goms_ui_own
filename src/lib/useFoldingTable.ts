import { useCallback, useRef } from 'react'

/** Folds a table's columns to fit its container instead of scrolling sideways: the right-most columns fold away one
 *  at a time (smoothly) until the table fits, and a row's folded values are shown as labelled details when its arrow is
 *  clicked. Put the returned ref on a <table className="fold-table">. The first column, and any column whose header is
 *  empty (an actions column), always stay; give a header data-fold-priority="n" (higher folds first) or
 *  data-fold="keep" to steer it. Styles are under ".fold-table" in index.css. Tables whose rows don't all have as many
 *  cells as the header (merged cells) are left alone. */
export function useFoldingTable() {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback((table: HTMLTableElement | null) => {
    cleanup.current?.()
    cleanup.current = table ? attachFolding(table) : null
  }, [])
}

/** The folding itself, for a table that is already in the page. Returns a function that stops it. */
export function attachFolding(table: HTMLTableElement): () => void {
  let folded = new Set<number>()
  let frame = 0
  let busy = false

  const rows = () => [...table.rows]
  const apply = (set: Set<number>) => {
    for (const row of rows()) for (const idx of set) row.cells[idx]?.setAttribute('data-folded', '')
    for (const row of rows()) [...row.cells].forEach((cell, idx) => { if (!set.has(idx)) cell.removeAttribute('data-folded') })
    table.toggleAttribute('data-folding', set.size > 0)
    if (!set.size) table.querySelectorAll('[data-fold-open]').forEach((row) => row.removeAttribute('data-fold-open'))
  }

  const run = () => {
    const box = table.parentElement
    const head = table.tHead?.rows[0]
    if (!box || !head || busy) return
    const heads = [...head.cells]
    const body = [...table.tBodies].flatMap((b) => [...b.rows])
    if (!body.length || body.some((row) => row.cells.length !== heads.length)) { apply(new Set()); folded = new Set(); return }
    busy = true
    try {
      body.forEach((row) => [...row.cells].forEach((cell, idx) => cell.setAttribute('data-label', heads[idx].textContent?.trim() ?? '')))
      const order = heads
        .map((th, idx) => ({ idx, th, priority: Number(th.getAttribute('data-fold-priority') ?? idx) }))
        .filter(({ idx, th }) => idx > 0 && th.getAttribute('data-fold') !== 'keep' && (th.textContent ?? '').trim() !== '')
        .sort((a, b) => b.priority - a.priority)
        .map(({ idx }) => idx)

      // Measure with transitions off, then walk back to what is on screen and switch to the result, so only the columns
      // that changed animate.
      table.setAttribute('data-fold-measure', '')
      apply(new Set())
      const next = new Set<number>()
      for (const idx of order) {
        if (table.getBoundingClientRect().width <= box.clientWidth + 1) break
        next.add(idx)
        apply(next)
      }
      apply(folded)
      void table.offsetWidth
      table.removeAttribute('data-fold-measure')
      void table.offsetWidth
      apply(next)
      folded = next
    } finally { busy = false }
  }

  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(run) }

  const onClick = (event: MouseEvent) => {
    if (!table.hasAttribute('data-folding')) return
    const cell = (event.target as HTMLElement).closest('td')
    const row = cell?.parentElement as HTMLTableRowElement | null
    if (!cell || !row || row.cells[0] !== cell || row.parentElement?.tagName !== 'TBODY') return
    const rect = cell.getBoundingClientRect()
    if (event.clientX < rect.right - 36) return
    event.stopPropagation()
    row.toggleAttribute('data-fold-open')
  }

  table.addEventListener('click', onClick, true)
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  if (table.parentElement) resize?.observe(table.parentElement)
  const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
    if (!busy && records.some((r) => r.type === 'childList')) schedule()
  })
  mutations?.observe(table, { childList: true, subtree: true })
  schedule()

  return () => {
    cancelAnimationFrame(frame)
    resize?.disconnect()
    mutations?.disconnect()
    table.removeEventListener('click', onClick, true)
  }
}
