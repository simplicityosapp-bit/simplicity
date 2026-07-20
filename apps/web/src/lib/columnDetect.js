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

/* ── robust money parser ────────────────────────────────────────────
   Shared by every import path so detection and extraction agree. Handles
   the shapes therapists' sheets actually contain:
     - currency + spaces:        "₪ 1,200"  "$1000"
     - thousands separators:     "1,234"  "1.234"  "1,234,567"
     - decimal comma (he/eu):    "1.234,56"  "12,50"
     - accounting negatives:     "(500)" → -500
     - trailing/leading minus:   "500-"  "-500"
   Returns a finite number, or NaN when it isn't money. */
export function parseAmount(v) {
  if (v == null) return NaN
  let s = String(v).trim()
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }   /* (123) accounting */
  s = s.replace(/[^\d.,-]/g, '')                                /* drop ₪ $ € spaces… */
  if (!s) return NaN
  if (s.includes('-')) { neg = true; s = s.replace(/-/g, '') }  /* leading/trailing minus */
  const hasComma = s.includes(','); const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    /* the LAST-occurring separator is the decimal point */
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    const commas = (s.match(/,/g) || []).length
    /* a single "1,234"-style group is thousands; "12,5" is a decimal */
    if (commas === 1 && !/^\d{1,3},\d{3}$/.test(s)) s = s.replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasDot) {
    /* "1.234.567" or "1.234" grouped in 3s → thousands */
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }
  /* collapse any leftover extra dots, keeping the last as the decimal */
  const dots = (s.match(/\./g) || []).length
  if (dots > 1) { const i = s.lastIndexOf('.'); s = s.slice(0, i).replace(/\./g, '') + s.slice(i) }
  const n = Number(s)
  if (!Number.isFinite(n)) return NaN
  return neg ? -n : n
}

/* ── per-value matchers ─────────────────────────────────────────── */

/* Israeli + international phone: lots of digits, optional +, dashes,
   spaces, parens, dots. We require ≥7 digits and a phone-ish shape, AND a
   phone START (local '0', or international '+'/'972') — this is what tells
   "052.123.4567" (a phone) apart from "1.234.567" (a dot-grouped amount),
   which share the same character set. */
export function looksPhone(v) {
  const s = clean(v)
  if (!s) return false
  if (looksDate(s) || looksEmail(s)) return false /* a date's digits aren't a phone */
  const digits = s.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return false
  /* reject the date separator '/' (a phone uses -, space, dot, parens). */
  if (/[/]/.test(s)) return false
  /* must look like a real phone NUMBER, not just digits: local numbers
     start 0, international start + or 972. */
  if (!(s.startsWith('+') || s.startsWith('(') || s.startsWith('00') || digits.startsWith('0') || digits.startsWith('972'))) return false
  return /^[+(]?[\d][\d\-\s().+]{5,}$/.test(s)
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
  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(s)) return true   /* ISO, dash or slash */
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
  /* must contain at least one digit and parse to a finite number via the
     shared money parser (so "(500)", "1.234,56", "500-" all count). */
  if (!/\d/.test(s)) return false
  return Number.isFinite(parseAmount(s))
}

/* Plausible person/entity name: short-ish text, mostly letters (Hebrew
   or latin), 1–4 words, no digits dominating. */
export function looksName(v) {
  const s = clean(v)
  if (!s || s.length > 40) return false
  if (looksEmail(s) || looksPhone(s) || looksDate(s) || looksAmount(s)) return false
  const words = s.split(/\s+/)
  if (words.length > 5) return false
  const letters = (s.match(/[א-תa-zA-Z]/g) || []).length
  return letters >= 2 && letters >= s.replace(/\s/g, '').length * 0.5
}

/* Known status vocabulary (client + lead). A column whose values mostly
   come from this set is a status column. */
const STATUS_VOCAB = [
  /* 'ביניים' is the status's former label — kept so spreadsheets exported
     before the rename to 'בהפסקה' still match on import. */
  'פעיל', 'פעילה', 'לא פעיל', 'לשעבר', 'בהפסקה', 'ביניים', 'נודד', 'ללא סטטוס', 'הוקפא', 'מוקפא', 'בהקפאה', 'מושהה',
  'בתהליך', 'חדש', 'חם', 'קר', 'פושר', 'בשיחה', 'פולואפ', 'בקשר', 'מעקב', 'בהמתנה', 'ממתין', 'מתעניין',
  'תיאום פגישה', 'הצעת מחיר', 'נשר', 'נשרה', 'עזב', 'סיים', 'הפסיק', 'לא ענה', 'לא מעוניין',
  'הומר', 'הומרו', 'נסגר', 'סגר', 'סגרה', 'נסגרה', 'נרשם', 'חתם', 'לא רלוונטי', 'נדחה', 'סירב',
  'רפאים', 'נעלם', 'גוסט',
  'active', 'inactive', 'past', 'lead', 'new', 'hot', 'cold', 'warm', 'won', 'lost', 'closed', 'pending', 'followup',
  'signed', 'quote', 'proposal', 'meeting', 'scheduled', 'enrolled', 'interested',
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

/* Find the real header row. Spreadsheets from the wild often open with a
   title banner, a logo row, an export-date line, or blank rows before the
   actual column headers. We scan the first ~10 rows and pick the best
   header candidate: the row with the most non-empty cells that look like
   headers (short, mostly text, mostly distinct) and whose NEXT row also
   has data. Returns the row index (0 if nothing better is found).
   Shared by the flat parser (csvImport) and the multi-sheet mapper
   (sheetMapper) so every import path skips banner/title rows alike. */
export function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 10)
  let bestIdx = 0; let bestScore = -1
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] || []
    const cells = row.map((c) => String(c == null ? '' : c).trim())
    const filled = cells.filter(Boolean)
    if (filled.length < 2) continue /* a header row has ≥2 columns */
    const next = (rows[i + 1] || []).map((c) => String(c == null ? '' : c).trim())
    const nextFilled = next.filter(Boolean).length
    if (nextFilled === 0) continue /* headers must be followed by data */
    /* Header-likeness: short cells, distinct, not mostly numeric. */
    const distinct = new Set(filled.map((c) => c.toLowerCase())).size
    const shortish = filled.filter((c) => c.length <= 30).length
    const numericish = filled.filter((c) => /^[-\d.,₪$€\s/]+$/.test(c)).length
    const score = filled.length
      + (distinct === filled.length ? 2 : 0)        /* all-unique bonus */
      + (shortish === filled.length ? 1 : 0)
      - numericish * 2                              /* a data row is mostly numbers */
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}
