/** Marks every card in the app with `data-card` so index.css can give it the hover lift and press. Cards are
 *  recognised as they appear (a raised-surface background with rounded corners and a border or shadow), so pages need
 *  no wrapper component. Cards have no entrance animation: they render in place at once.
 *  Left alone: anything inside a dialog/menu, nested cards (only the outermost is marked), and anything marked
 *  `data-no-card-motion`. */
const CANDIDATES = 'div, section, article, li, aside, figure, form, a, button'
const SKIP = '[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-no-card-motion], input, select, textarea, td, th, tr, thead, tbody'

const MAX_SCAN = 1500

const seen = new WeakSet<HTMLElement>()

function surfaceColour() {
  const [r, g, b] = getComputedStyle(document.documentElement).getPropertyValue('--c-white').trim().split(/\s+/)
  return `rgb(${r}, ${g}, ${b})`
}

function isCard(el: HTMLElement, surface: string) {
  if (seen.has(el) || el.closest(SKIP)) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 120 || rect.height < 56 || rect.height > 640) return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.position === 'fixed' || style.position === 'absolute') return false
  if (parseFloat(style.borderTopLeftRadius) < 6) return false
  const named = /(card|panel|tile|kpi)/.test(el.className.toString())
  if (!named && style.backgroundColor !== surface) return false
  const framed = parseFloat(style.borderTopWidth) > 0 || style.boxShadow !== 'none'
  return named || framed
}

/** Only the outermost card of a nest is marked; the ones inside ride along with it. */
const insideCard = (el: HTMLElement) => !!el.parentElement?.closest('[data-card]')

export function installCardMotion() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  const scan = (roots: Element[]) => {
    const surface = surfaceColour()
    for (const root of roots) {
      const list = [...(root.matches(CANDIDATES) ? [root] : []), ...root.querySelectorAll(CANDIDATES)] as HTMLElement[]
      for (const el of list.slice(0, MAX_SCAN)) {
        if (!el.isConnected || !isCard(el, surface)) continue
        seen.add(el)
        if (insideCard(el)) continue
        const rect = el.getBoundingClientRect()
        el.setAttribute('data-card', rect.width <= 760 && rect.height <= 420 ? 'sm' : 'lg')
      }
    }
  }

  new MutationObserver((records) => {
    const added: Element[] = []
    for (const record of records) record.addedNodes.forEach((node) => { if (node instanceof Element) added.push(node) })
    if (added.length) scan(added)
  }).observe(document.body, { childList: true, subtree: true })
  scan([document.body])
}
