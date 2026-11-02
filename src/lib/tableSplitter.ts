/** A drag handle on the right edge of a table's box, like a splitter: dragging it narrows the box, and the table inside
 *  folds the columns that no longer fit (see attachFolding). Double-click, or Escape, gives the full width back; the
 *  arrow keys nudge it. The handle is the last child of the box (which is made `position: relative` if it is not).
 *  Styles are under ".table-splitter" in index.css. Returns a function that removes it. */
const MIN_WIDTH = 280
const KEY_STEP = 24

export function attachSplitter(table: HTMLTableElement): () => void {
  return table.parentElement ? attachSplitterTo(table.parentElement) : () => {}
}

/** The same splitter on any box: an element the content inside reflows to (columns that fold, container queries). */
export function attachSplitterTo(box: HTMLElement): () => void {
  const madeRelative = getComputedStyle(box).position === 'static'
  if (madeRelative) box.style.position = 'relative'
  box.setAttribute('data-splittable', '')

  const handle = document.createElement('div')
  handle.className = 'table-splitter'
  handle.setAttribute('role', 'separator')
  handle.setAttribute('aria-orientation', 'vertical')
  handle.setAttribute('aria-label', 'Drag to resize the table; double-click to reset')
  handle.tabIndex = 0
  handle.appendChild(document.createElement('i'))
  box.appendChild(handle)

  /** The width the box has when nothing is forcing it, i.e. its most open state. */
  const naturalWidth = () => {
    const previous = box.style.width
    box.style.width = ''
    const width = box.getBoundingClientRect().width
    box.style.width = previous
    return width
  }
  const setWidth = (width: number, natural: number) => {
    if (width >= natural - 2) box.style.width = ''
    else box.style.width = `${Math.round(Math.max(MIN_WIDTH, width))}px`
    handle.setAttribute('data-width', box.style.width ? `${Math.round(box.getBoundingClientRect().width)} px` : 'full width')
  }
  const reset = () => {
    box.style.transition = 'width 240ms cubic-bezier(0.16, 1, 0.3, 1)'
    box.style.width = ''
    handle.removeAttribute('data-width')
    window.setTimeout(() => { box.style.transition = '' }, 280)
  }

  let drag: { startX: number; startWidth: number; natural: number } | null = null
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    box.style.transition = ''
    drag = { startX: event.clientX, startWidth: box.getBoundingClientRect().width, natural: naturalWidth() }
    handle.setPointerCapture(event.pointerId)
    handle.setAttribute('data-dragging', '')
    document.body.style.userSelect = 'none'
  }
  const onMove = (event: PointerEvent) => {
    if (drag) setWidth(drag.startWidth + event.clientX - drag.startX, drag.natural)
  }
  const onUp = () => {
    if (!drag) return
    drag = null
    handle.removeAttribute('data-dragging')
    document.body.style.userSelect = ''
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { reset(); return }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const natural = naturalWidth()
    setWidth(box.getBoundingClientRect().width + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP), natural)
  }

  handle.addEventListener('pointerdown', onDown)
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
  handle.addEventListener('keydown', onKey)
  handle.addEventListener('dblclick', reset)

  return () => {
    handle.remove()
    box.removeAttribute('data-splittable')
    box.style.width = ''
    box.style.transition = ''
    if (madeRelative) box.style.position = ''
    document.body.style.userSelect = ''
  }
}
