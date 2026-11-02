import { attachFolding } from './useFoldingTable'
import { attachSplitter, attachSplitterTo } from './tableSplitter'

/** Gives every table in the app the folding columns and the drag splitter, without each page having to ask: tables are
 *  picked up as they appear and let go of when they go. A table that already folds through `useFoldingTable` only gets
 *  the splitter. Left alone: tables with fewer than three columns, grids (role="grid"), tables inside editable text,
 *  nested tables, and anything marked `data-no-fold` (on the table or an ancestor). */
const SKIP = '[role="grid"], [data-no-fold], [contenteditable], .ProseMirror, .tiptap, td, th'

const attached = new WeakMap<HTMLElement, () => void>()

function eligible(table: HTMLTableElement) {
  if (!table.parentElement || table.closest(SKIP) || table.parentElement.closest('[data-no-fold]')) return false
  return (table.tHead?.rows[0]?.cells.length ?? 0) >= 3
}

function attach(table: HTMLTableElement) {
  if (attached.has(table) || !eligible(table)) return
  const stops: (() => void)[] = []
  if (!table.classList.contains('fold-table')) {
    table.setAttribute('data-fold-table', '')
    stops.push(attachFolding(table), () => table.removeAttribute('data-fold-table'))
  }
  stops.push(attachSplitter(table))
  attached.set(table, () => stops.reverse().forEach((stop) => stop()))
}

/** A table built from divs (`role="table"`) reflows through container queries on an ancestor, so that ancestor is the
 *  box the splitter narrows; without one there is nothing that would respond, and it is left alone. */
const containerOf = (el: Element) => {
  for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).containerType !== 'normal') return p
  return null
}

function attachRoleTable(el: HTMLElement) {
  if (attached.has(el) || el.closest('[data-no-fold]')) return
  const box = containerOf(el)
  if (box) attached.set(el, attachSplitterTo(box))
}

function detach(table: HTMLElement) {
  attached.get(table)?.()
  attached.delete(table)
}

const SELECTOR = 'table, [role="table"]'
const tablesIn = (node: Node): HTMLElement[] => {
  if (!(node instanceof Element)) return []
  return [...(node.matches(SELECTOR) ? [node] : []), ...node.querySelectorAll(SELECTOR)] as HTMLElement[]
}
const attachAny = (el: HTMLElement) => (el instanceof HTMLTableElement ? attach(el) : attachRoleTable(el))

export function installAutoFoldTables() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  new MutationObserver((records) => {
    for (const record of records) record.removedNodes.forEach((node) => tablesIn(node).forEach((t) => { if (!t.isConnected) detach(t) }))
    for (const record of records) record.addedNodes.forEach((node) => tablesIn(node).forEach(attachAny))
  }).observe(document.body, { childList: true, subtree: true })
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach(attachAny)
}
