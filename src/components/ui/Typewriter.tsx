/** Text that types itself in: each letter drops in a beat after the one before, with a caret that blinks out at the
 *  end. It plays again whenever `text` changes (the key restarts it). Screen readers get the whole text at once.
 *  Styles are under ".typewriter" in index.css; reduced motion shows the text as is. */
export function Typewriter({ text, className, step = 45 }: { text: string; className?: string; step?: number }) {
  return (
    <span key={text} className={`typewriter ${className ?? ''}`} aria-label={text}>
      {[...text].map((char, i) => (
        <span key={i} aria-hidden="true" className="typewriter-char" style={{ animationDelay: `${i * step}ms` }}>
          {char === ' ' ? '\u00a0' : char}
        </span>
      ))}
      <span aria-hidden="true" className="typewriter-caret" style={{ animationDelay: `${text.length * step}ms` }} />
    </span>
  )
}
