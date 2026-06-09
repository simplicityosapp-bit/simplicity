import { MG_WORDS, mgToReadable, hasMG } from '../lib/multiGender'

/* ════════════════════════════════════════════════════════════════
   <MG> — render Multi-Gender Hebrew accessibly.
   ════════════════════════════════════════════════════════════════
   Two ways to call it:
     <MG word="client_new" />   — a key from lib/multiGender.js
     <MG text={statusLabel} />  — any string (may or may not carry glyphs)

   The merge glyphs sit on unassigned Unicode codepoints, so a screen
   reader would skip/garble them. We render the glyph visually but
   `aria-hidden`, paired with a visually-hidden (`sr-only`) readable
   slash form that assistive tech announces instead. Strings WITHOUT any
   merge glyph render as plain text (zero overhead), so <MG text> is safe
   to wrap mixed labels (e.g. a status that may be "פעיל׌" or a custom name).
   ════════════════════════════════════════════════════════════════ */
export default function MG({ word, text, className = '' }) {
  const entry = word ? MG_WORDS[word] : null
  const visible = entry ? entry.mg : text
  if (visible == null) return null
  if (!hasMG(visible)) return className ? <span className={className}>{visible}</span> : <>{visible}</>
  const readable = entry ? entry.aria : mgToReadable(visible)
  return (
    <span className={`mg-text ${className}`.trim()}>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{readable}</span>
    </span>
  )
}
