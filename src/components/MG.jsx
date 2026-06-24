import { MG_WORDS, mgToReadable, hasMG } from '../lib/multiGender'
import { useT } from '../i18n/useT'

/* ════════════════════════════════════════════════════════════════
   <MG> — render Multi-Gender Hebrew accessibly (language-aware).
   ════════════════════════════════════════════════════════════════
   Two ways to call it:
     <MG word="client_new" />   — a key from lib/multiGender.js
     <MG text={statusLabel} />  — any string (may or may not carry glyphs)

   WORD mode: in Hebrew we render the merge-glyph form (the dual-gender
   font trick); in every other language there's no such glyph, so we
   resolve the plain translation via i18n (common:mgWords.<word>, with the
   user's gender applied as i18next context where a variant exists).

   The merge glyphs sit on unassigned Unicode codepoints, so a screen
   reader would skip/garble them. We render the glyph visually but
   `aria-hidden`, paired with a visually-hidden (`sr-only`) readable
   slash form that assistive tech announces instead. Strings WITHOUT any
   merge glyph render as plain text (zero overhead), so <MG text> is safe
   to wrap mixed labels (e.g. a status that may be "פעיל׌" or a custom name).
   ════════════════════════════════════════════════════════════════ */
export default function MG({ word, text, className = '' }) {
  const { t, lang } = useT('common')

  /* Non-Hebrew word: render the translated plain word (no merge glyph). */
  if (word && lang !== 'he') {
    const translated = t(`mgWords.${word}`)
    return className ? <span className={className}>{translated}</span> : <>{translated}</>
  }

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
