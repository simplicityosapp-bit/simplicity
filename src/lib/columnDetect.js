/* ════════════════════════════════════════════════════════════════
   COLUMN DETECT — guess a column's meaning from its VALUES.
   ════════════════════════════════════════════════════════════════
   Header names vary wildly across the therapists who'll upload files
   ("נייד", "מס' טלפון", "Cell", "phone#"…), so matching headers alone
   misses most real sheets. This module classifies a column by sampling
   its actual cell values and scoring them against detectors:
     phone · email · date · amount · status · name · text
   Pure + dependency-free. Used as a FALLBACK after header-synonym
   matching, and to guess a sheet's entity type from its columns.
   ════════════════════════════════════════════════════════════════ */

const clean = (v) => String(v == null ? '' : v).trim()

/* ── per-value matchers ─────────────────────────────────────────── */

/* Israeli + international phone: lots of digits, optional +, dashes,
   spaces, parens. We require ≥7 digits and a phone-ish shape. */
export function looksPhone(v) {
  const s = clean(v)
  if (!s) return false
  if (looksDate(s)) return false /* a date's digits aren't a phone */
  const digits = s.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return false
  /* reject date-like separators (a phone uses - and spaces, not / or .) */
  if (/[/]/.test(s)) return false
  return /^[+()\d][\d\-\s()+]{6,}$/.test(s)
}

export function looksEmail(v) {
  const s = clean(v)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

/* A parseable date: ISO, dd/mm/yy(yy), dd.mm.yyyy, dd-mm-yyyy, or a
   spreadsheet Date that arrived as YYYY-MM-DD. Not a bare month number. */
export function looksDate(v) {
  const s = clean(v).split(/[ T]/)[0]
  if (!s) return false
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return true
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s)) return true
  return false
}

/* A money/amount value: digits, optional currency sign, thousands
   separators, decimals, optional leading minus. Excludes phone-like
   (too many digits) and bare years. */
export function looksAmount(v) {
  const s = clean(v)
  if (!s) return false
  if (looksPhone(s) || looksDate(s)) return false
  /* strip currency + separators, then it must be a finite number */
  const stripped = s.replace(/[₪$€£,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return false
  return true
}

/* Plausible person/entity name: short-ish text, mostly letters (Hebrew
   or latin), 1–4 words, no digits dominating. */
export function looksName(v) {
  const s = clean(v)
  if (!s || s.length > 40) return false
  if (looksEmail(s) || looksPhone(s) || looksDate(s) || looksAmount(s)) return false
  const words = s.split(/\s+/)
  if (words.length > 5) return false
  const letters = (s.match(/[֐-׿a-zA-Z]/g) || []).length
  return letters >= 2 && letters >= s.replace(/\s/g, '').length * 0.5
}

/* Known status vocabulary (client + lead). A column whose values mostly
   come from this set is a status column. */
const STATUS_VOCAB = [
  'פעיל', 'פעילה', 'לא פעיל', 'לשעבר', 'ביניים', 'נודד', 'ללא סטטוס', 'הוקפא',
  'בתהליך', 'חדש', 'חם', 'קר', 'בשיחה', 'פולואפ', 'בקשר', 'מעקב', 'בהמתנה', 'מתעניין',
  'הומר', 'הומרו', 'נסגר', 'סגר', 'סגרה', 'נסגרה', 'לא רלוונטי', 'נדחה', 'סירב',
  'רפאים', 'נעלם', 'גוסט',
  'active', 'inactive', 'past', 'lead', 'new', 'hot', 'cold', 'won', 'lost', 'closed', 'pending', 'followup',
]
const normV = (s) => clean(s).toLowerCase().replace(/["'`״׳/]/g, '').replace(/\s+/g, '')
const STATUS_SET = new Set(STATUS_VOCAB.map(normV))
export function looksStatus(v) {
  const n = normV(v)
  if (!n) return false
  if (STATUS_SET.has(n)) return true
  return STATUS_VOCAB.some((s) => n.includes(normV(s)) && normV(s).length >= 3)
}

/* ── column-level classification ────────────────────────────────── */

/* Sample up to `limit` non-empty values from a column (by index) across
   the given data rows. */
export function sampleColumn(rows, colIdx, limit = 25) {
  const out = []
  for (const r of rows) {
    const v = clean(r[colIdx])
    if (v) out.push(v)
    if (out.length >= limit) break
  }
  return out
}

/* Classify a column from its values → { type, confidence } where type is
   one of: phone | email | date | amount | status | name | text. The type
   wins when ≥60% of sampled values match its detector; ties resolve by a
   fixed specificity order (email/phone/date/amount before status/name). */
export function classifyColumnValues(values) {
  const vals = (values || []).filter(Boolean)
  if (!vals.length) return { type: 'text', confidence: 0 }
  const frac = (fn) => vals.filter(fn).length / vals.length
  const scores = {
    email:  frac(looksEmail),
    phone:  frac(looksPhone),
    date:   frac(looksDate),
    amount: frac(looksAmount),
    status: frac(looksStatus),
    name:   frac(looksName),
  }
  /* Specificity order — the more constrained detectors win ties. Date
     before phone so an 8-digit ISO date isn't mistaken for a phone. */
  const order = ['email', 'date', 'phone', 'amount', 'status', 'name']
  let best = 'text'; let bestScore = 0
  for (const t of order) {
    if (scores[t] > bestScore + 1e-9) { best = t; bestScore = scores[t] }
  }
  if (bestScore < 0.6) return { type: 'text', confidence: bestScore }
  return { type: best, confidence: bestScore }
}

/* Convenience: classify column `colIdx` of `rows`. */
export function detectColumnType(rows, colIdx) {
  return classifyColumnValues(sampleColumn(rows, colIdx))
}
