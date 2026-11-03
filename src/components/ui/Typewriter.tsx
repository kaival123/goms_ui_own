import { useEffect, useState } from 'react'

const TYPING_MS = 50
const CARET_LINGER_MS = 1500

/** Text that types itself in one character at a time, each letter appearing in place (nothing slides), behind a
 *  blinking, softly glowing caret. The caret leaves 1.5s after the last letter. It types again whenever `text`
 *  changes. The untyped rest of the text is kept (invisible) so the line never changes width while it types, and
 *  screen readers get the whole text at once. Styles are under ".typewriter" in index.css; reduced motion shows the
 *  text as is. */
export function Typewriter({ text, className, speed = TYPING_MS }: { text: string; className?: string; speed?: number }) {
  const [count, setCount] = useState(0)
  const [caret, setCaret] = useState(true)

  useEffect(() => {
    setCount(0)
    setCaret(true)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setCount(text.length)
      setCaret(false)
      return
    }
    let n = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      n += 1
      setCount(n)
      timer = setTimeout(n < text.length ? tick : () => setCaret(false), n < text.length ? speed : CARET_LINGER_MS)
    }
    timer = setTimeout(tick, speed)
    return () => clearTimeout(timer)
  }, [text, speed])

  return (
    <span className={`typewriter ${className ?? ''}`} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      {caret && <span aria-hidden="true" className="typewriter-caret" />}
      <span aria-hidden="true" className="invisible">{text.slice(count)}</span>
    </span>
  )
}
