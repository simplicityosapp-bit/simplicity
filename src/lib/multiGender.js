/* ════════════════════════════════════════════════════════════════
   MULTI-GENDER HEBREW words — entity nouns rendered in both genders.
   ════════════════════════════════════════════════════════════════
   The Alef MultiGndr font (see index.css .mg-text) encodes 12 special
   "merge" letters on unassigned Hebrew-block codepoints. Each merges a
   masculine + feminine ending into one glyph, so an entity noun whose
   real-world gender is unknown (a client, a lead) can be written once
   and read as both — instead of forcing "לקוח" or "לקוחה" or a slash.

   We build the strings with String.fromCharCode so the special codepoint
   is unambiguous in source (no reliance on the editor preserving it).

   Each entry carries:
     mg   — the visible string WITH the special glyph (needs .mg-text font)
     aria — the plain, readable form for screen readers + fallback (the
            special codepoint is unassigned in Unicode, so TTS/search would
            otherwise read garbage).
   ════════════════════════════════════════════════════════════════ */

/* The merge glyphs we use (unassigned Hebrew-block codepoints). */
export const MG_GLYPHS = {
  HE:  String.fromCharCode(0x05CC), // optional ה  (לקוח/לקוחה)
  TAV: String.fromCharCode(0x05CD), // optional ת  (ממוקד/ממוקדת)
  YOD: String.fromCharCode(0x05CA), // optional י  (בחר/בחרי)
  PLU: String.fromCharCode(0x05C9), // plural ם/ת  (פעילים/פעילות)
}
const HE = MG_GLYPHS.HE

export const MG_WORDS = {
  /* the bare entity noun: "לקוח" / "לקוחה" */
  client: { mg: `לקוח${HE}`, aria: 'לקוח/ה' },
  /* add-client CTA / modal title: "לקוח חדש" / "לקוחה חדשה" */
  client_new: { mg: `לקוח${HE} חדש${HE}`, aria: 'לקוח/ה חדש/ה' },
}

/* Any multi-gender merge glyph present? (used to decide whether a string
   needs the accessible sr-only treatment). */
const GLYPH_RE = /[׈-׏׫-׮]/
export function hasMG(str) {
  return typeof str === 'string' && GLYPH_RE.test(str)
}

/* Convert a string that contains merge glyphs back to a plain, readable
   slash form for screen readers / search. The plural pair ׊׉ is handled
   before the single glyphs so "פעיל׊׉" → "פעילים/ות" (not "פעיל/י/ות"). */
const READABLE = [
  [MG_GLYPHS.YOD + MG_GLYPHS.PLU, 'ים/ות'],
  [MG_GLYPHS.HE,  '/ה'],
  [MG_GLYPHS.TAV, '/ת'],
  [MG_GLYPHS.YOD, '/י'],
  [MG_GLYPHS.PLU, 'ים/ות'],
]
export function mgToReadable(str) {
  if (typeof str !== 'string') return str
  let out = str
  for (const [glyph, txt] of READABLE) out = out.split(glyph).join(txt)
  return out
}
