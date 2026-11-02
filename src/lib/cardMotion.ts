/** One entrance for every card in the app, modelled on the reference "AI agents" demo: cards rise out of a tilted,
 *  slightly blurred stack and unfold into place one after another, then settle. Cards are recognised as they appear
 *  (a raised-surface background with rounded corners and a border or shadow), so pages need no wrapper component.
 *  The motion is Web Animations on `transform`/`opacity`/`filter`, so React-managed classes and styles are never
 *  touched; the hover lift lives in index.css under `[data-card]` and uses the independent `translate` property.
 *  Left alone: anything inside a dialog/menu, nested cards (only the outermost moves), anything marked
 *  `data-no-card-motion`, and everything when the user prefers reduced motion. */
const CANDIDATES = 'div, section, article, li, aside, figure, form, a, button'
const SKIP = '[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-no-card-motion], input, select, textarea, td, th, tr, thead, tbody'

const STAGGER = 55
const MAX_DELAY = 440
const MAX_SCAN = 1500
const DURATION = 2000
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

const seen = new WeakSet<HTMLElement>()
let reduced = false

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

/** Only the outermost card of a nest moves; the ones inside ride along with it. */
const insideCard = (el: HTMLElement) => !!el.parentElement?.closest('[data-card]')

function play(cards: HTMLElement[]) {
  cards.sort((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
    return Math.abs(ra.top - rb.top) > 24 ? ra.top - rb.top : ra.left - rb.left
  })
  const rects = cards.map((el) => el.getBoundingClientRect())
  /** The pile the cards start in: horizontally the middle of the group, a little below its lowest edge. */
  const pileX = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2
  const pileY = Math.max(...rects.map((r) => r.bottom)) + 40
  const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v))
  const narrow = window.innerWidth < 640
  const mid = (cards.length - 1) / 2
  cards.forEach((el, i) => {
    const r = rects[i]
    const dx = clamp(pileX - (r.left + r.width / 2), 520)
    const dy = clamp(pileY - (r.top + r.height / 2), 360)
    const fan = clamp((i - mid) * 7, 24)
    const lift = (i - mid) * (narrow ? 2 : 6)
    const delay = Math.min(i * STAGGER, MAX_DELAY)
    el.animate(
      [
        { opacity: 0, filter: 'blur(7px)', transform: `perspective(900px) translate(${dx}px, ${dy + lift}px) rotateX(${narrow ? 20 : 38}deg) rotateZ(${fan}deg) scale(0.42)` },
        { opacity: 1, filter: 'blur(4px)', offset: 0.35 },
        { opacity: 1, filter: 'blur(0)', transform: 'perspective(900px) translate(0, 0) rotateX(0) rotateZ(0) scale(1)' },
      ],
      { duration: DURATION, delay, easing: EASE, fill: 'backwards' },
    )
  })
}

const inView = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth
}

export function installCardMotion() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || typeof IntersectionObserver === 'undefined') return
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced = query.matches
  query.addEventListener('change', () => { reduced = query.matches })

  /** Cards that were below the fold when they appeared move when they scroll into view. */
  const reveal = new IntersectionObserver((entries) => {
    const now = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement)
    now.forEach((el) => reveal.unobserve(el))
    if (now.length && !reduced) play(now)
  }, { rootMargin: '0px 0px -8% 0px' })

  const scan = (roots: Element[]) => {
    const surface = surfaceColour()
    const found: HTMLElement[] = []
    for (const root of roots) {
      const list = [...(root.matches(CANDIDATES) ? [root] : []), ...root.querySelectorAll(CANDIDATES)] as HTMLElement[]
      for (const el of list.slice(0, MAX_SCAN)) {
        if (!el.isConnected || !isCard(el, surface)) continue
        seen.add(el)
        if (insideCard(el)) continue
        const rect = el.getBoundingClientRect()
        el.setAttribute('data-card', rect.width <= 760 && rect.height <= 420 ? 'sm' : 'lg')
        found.push(el)
      }
    }
    if (reduced || !found.length) return
    const visible = found.filter(inView)
    found.filter((el) => !visible.includes(el)).forEach((el) => reveal.observe(el))
    if (visible.length) play(visible)
  }

  new MutationObserver((records) => {
    const added: Element[] = []
    for (const record of records) record.addedNodes.forEach((node) => { if (node instanceof Element) added.push(node) })
    if (added.length) scan(added)
  }).observe(document.body, { childList: true, subtree: true })
  scan([document.body])
}
