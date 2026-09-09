/* ════════════════════════════════════════════════════════════════
   MULTI-GENDER HEBREW words — entity nouns rendered in both genders.
   ════════════════════════════════════════════════════════════════
   The Alef MultiGndr font encodes 12 special "merge" letters on unassigned
   Hebrew-block codepoints. Each merges a masculine + feminine ending into
   one glyph, so a noun whose real-world gender is unknown (a client, a
   lead) can be written once and read as both — instead of forcing "לקוח"
   or "לקוחה" or a slash.

   Strings are built with String.fromCharCode so the codepoint is
   unambiguous in source, rather than relying on every editor along the way
   to preserve it.

   Shared because both apps carry these strings and neither can render them
   the same way. Web loads the merge font and shows the glyph, pairing it
   with a hidden readable form for screen readers. apps/mobile deliberately
   does NOT load that font — the converted TTF was a prime suspect while a
   device build was closing instantly on launch, and it has stayed out
   since — so on a phone the glyph has nothing to draw it and comes out as
   a box. Mobile therefore renders mgToReadable() instead, which is why
   this could not stay in apps/web.
   ════════════════════════════════════════════════════════════════ */

/* The merge glyphs we use (unassigned Hebrew-block codepoints). */
export const MG_GLYPHS = {
  HE: String.fromCharCode(0x05CC), // optional ה  (לקוח/לקוחה)
  TAV: String.fromCharCode(0x05CD), // optional ת  (ממוקד/ממוקדת)
  YOD: String.fromCharCode(0x05CA), // optional י  (בחר/בחרי)
  PLU: String.fromCharCode(0x05C9), // plural ם/ת  (פעילים/פעילות)
}
const HE = MG_GLYPHS.HE

export interface MgWord { mg: string; aria: string }

export const MG_WORDS: Record<string, MgWord> = {
  /* the bare entity noun: "לקוח" / "לקוחה" */
  client: { mg: `לקוח${HE}`, aria: 'לקוח/ה' },
  /* add-client CTA / modal title: "לקוח חדש" / "לקוחה חדשה" */
  client_new: { mg: `לקוח${HE} חדש${HE}`, aria: 'לקוח/ה חדש/ה' },
  /* consent verb: "מסכים" / "מסכימה" — used by the signup + re-acceptance
     consent checkboxes ("קראתי ומסכים/ה ל…"). */
  agree: { mg: `מסכים${HE}`, aria: 'מסכים/ה' },
}

/* Any multi-gender merge glyph present? (used to decide whether a string
   needs the accessible treatment). */
const GLYPH_RE = /[׈-׏׫-׮]/
export function hasMG(str: unknown): boolean {
  return typeof str === 'string' && GLYPH_RE.test(str)
}

/* Convert a string containing merge glyphs back to a plain, readable slash
   form — for screen readers, for search, and for any surface without the
   font. The plural pair is handled BEFORE the single glyphs so "פעיל׊׉"
   becomes "פעילים/ות" and not "פעיל/י/ות". */
const READABLE: [string, string][] = [
  [MG_GLYPHS.YOD + MG_GLYPHS.PLU, 'ים/ות'],
  [MG_GLYPHS.HE, '/ה'],
  [MG_GLYPHS.TAV, '/ת'],
  [MG_GLYPHS.YOD, '/י'],
  [MG_GLYPHS.PLU, 'ים/ות'],
]
export function mgToReadable<T>(str: T): T | string {
  if (typeof str !== 'string') return str
  let out: string = str
  for (const [glyph, txt] of READABLE) out = out.split(glyph).join(txt)
  return out
}

/* The bare form, for COMPARING a merge-glyph label against plain text:
   "פעיל׌" → "פעיל". A spreadsheet writes "פעיל"; the app's own default
   status is the dual-gender "פעיל׌", and a plain string compare called
   those two different things — so importing an ordinary Hebrew status
   column created a second "פעיל" beside the one already there, and put
   both in the same dropdown. For comparison only: never store or display
   the stripped form, it silently picks one gender. */
const GLYPH_RE_G = /[׈-׏׫-׮]/g
export function mgStrip<T>(str: T): T | string {
  return typeof str === 'string' ? str.replace(GLYPH_RE_G, '') : str
}
