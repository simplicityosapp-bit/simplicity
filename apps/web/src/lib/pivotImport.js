/* ════════════════════════════════════════════════════════════════
   PIVOT IMPORT — detect & flatten matrix-shaped spreadsheets.
   ════════════════════════════════════════════════════════════════
   Many coaches track income/expenses in a CROSS-TAB (matrix) layout
   rather than one-row-per-record:

       שם הפרוייקט | מאי  | יוני | יולי | …      ← period columns
       אימון אישי   | 2350 | 2100 | 5370 | …
       קבוצות       | 1200 |   0  |   0  | …

   The flat parser (csvImport.js) can't read this — it treats "מאי",
   "יוני"… as unknown columns. This module:
     1. DETECTS whether a sheet is a matrix (most headers look like
        months / dates / period words).
     2. FLATTENS it: every numeric cell (labelRow, periodCol, value>0)
        becomes a suggested transaction { label, period, amount }.
     3. Flags likely SUMMARY rows (סהכ / רווח …) so the UI can let the
        user exclude them.
   Everything here is PURE + deterministic and fully overridable: the
   UI passes an explicit config (which column is the label, which are
   periods, which rows to skip, the year) so the user has final say.
   ════════════════════════════════════════════════════════════════ */

import { parseAmount } from './columnDetect'

/* Hebrew month names → 1-based month number. Covers full names; the
   detector also accepts numeric/date-like headers. */
export const HE_MONTHS = {
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
  'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
}

/* Hebrew month ABBREVIATIONS (coaches shorten freely: "ינו", "פבר"…).
   מאי/מרץ have no shorter form; their full names already cover them. */
const HE_MONTH_ABBR = {
  'ינו': 1, 'פבר': 2, 'אפר': 4, 'יונ': 6, 'יול': 7,
  'אוג': 8, 'ספט': 9, 'אוק': 10, 'אוקט': 10, 'נוב': 11, 'דצמ': 12,
}

/* English month names, full + 3-letter abbreviations (incl. "sept"). */
const EN_MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
}

/* Quarter labels → the quarter's START month, so a quarterly cross-tab
   still produces a dated transaction (Q1→Jan, Q2→Apr, Q3→Jul, Q4→Oct).
   Covers Q1/q1, Hebrew "רבעון 1", lettered "רבעון א׳", ordinal "רבעון
   ראשון" and the short "ר1"/"ר3". Half-years (H1/H2 · חציון/מחצית) map to
   their start month too (H1→Jan, H2→Jul). */
const QUARTER_START = { 1: 1, 2: 4, 3: 7, 4: 10 }
const HE_LETTER_NUM = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4 }
const HE_ORDINAL = { 'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'ראשונה': 1, 'שניה': 2, 'שנייה': 2 }

/* Period header words that aren't months but still mark a value column
   (used by expense sheets: חודשי / שנתי …). They don't map to a month;
   the flattener keeps the header text as the period label. */
const PERIOD_WORDS = ['חודשי', 'שנתי', 'שבועי', 'יומי', 'רבעוני', 'monthly', 'yearly', 'weekly', 'annual', 'quarterly']

/* Summary-row label hints — rows whose label looks like a total/derived
   figure, not a real entity. The UI pre-checks these as "skip". */
const SUMMARY_HINTS = ['סהכ', 'סה״כ', 'סה"כ', 'סךהכל', 'רווח', 'profit', 'total', 'subtotal', 'ממוצע', 'average', 'avg']

/* Expense-row label hints — labels that read like a cost, so a mixed
   income/expense sheet can pre-classify each row's type. Everything not
   matched defaults to income. The user can flip any row in the UI. */
const EXPENSE_HINTS = [
  'הוצאה', 'הוצאות', 'שיווק', 'פרסום', 'ביטוח', 'ביטוחלאומי', 'מנוי', 'מנויים', 'שכירות',
  'שכרדירה', 'הנהחשבונות', 'רואהחשבון', 'עמלה', 'עמלות', 'ציוד', 'תוכנה', 'מסים', 'מע״מ', 'מעמ',
  'expense', 'cost', 'rent', 'insurance', 'marketing', 'subscription', 'tax', 'fee',
]

/* Guess a row's transaction type from its label. Returns 'income' |
   'expense'. Default income; expense only on a hint match. */
export function guessRowType(label) {
  const n = norm(label)
  if (!n) return 'income'
  return EXPENSE_HINTS.some((h) => n === norm(h) || n.includes(norm(h))) ? 'expense' : 'income'
}

/* Does the LABEL-COLUMN HEADER itself mark the whole sheet as expenses?
   A sheet headed "הוצאה \\ מנוי" lists costs whose row labels are vendor
   names (גוגל / קלוד …) that don't match per-row expense hints — so
   without this the whole sheet would be misread as income. */
const EXPENSE_HEADER_HINTS = [
  'הוצאה', 'הוצאות', 'מנוי', 'מנויים', 'expense', 'expenses', 'cost', 'costs', 'spend', 'spending', 'subscription',
]
export function isExpenseLabelHeader(header) {
  const n = norm(header)
  if (!n) return false
  return EXPENSE_HEADER_HINTS.some((h) => n.includes(norm(h)))
}

/* Derive a 4-digit year from a sheet name ("2025" → 2025, "הכנסות 2026"
   → 2026). Returns null when no plausible year is present. */
export function yearFromSheetName(name) {
  const m = String(name || '').match(/(20\d{2}|19\d{2})/)
  return m ? Number(m[1]) : null
}

/* What the matrix's ROW LABELS represent, guessed from the label-column
   header. "שם הפרוייקט" → project; "שם הלקוח"/"לקוח" → client; anything
   else (e.g. "הוצאה") → category (label is a free-text category/desc,
   not a linkable entity). Overridable in the UI. */
const PROJECT_LABEL_HINTS = ['פרויקט', 'פרוייקט', 'project', 'program', 'תוכנית', 'מסלול', 'שירות']
const CLIENT_LABEL_HINTS = ['לקוח', 'מטופל', 'חניך', 'client', 'customer', 'name', 'שם מלא', 'שםמלא']
export function guessLabelKind(labelHeader) {
  const n = norm(labelHeader)
  if (!n) return 'category'
  if (PROJECT_LABEL_HINTS.some((h) => n.includes(norm(h)))) return 'project'
  if (CLIENT_LABEL_HINTS.some((h) => n.includes(norm(h)))) return 'client'
  return 'category'
}

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/["'`״׳]/g, '').replace(/\s+/g, '')

/* Resolve a single normalized token to a month number, trying (in
   order): full Hebrew name, Hebrew abbreviation, English full/abbrev. */
function monthFromToken(tok) {
  if (!tok) return null
  for (const [name, num] of Object.entries(HE_MONTHS)) if (norm(name) === tok) return num
  if (HE_MONTH_ABBR[tok]) return HE_MONTH_ABBR[tok]
  if (EN_MONTHS[tok]) return EN_MONTHS[tok]
  return null
}

/* Classify a single header cell as a period column. Returns
   { period: <label>, month: <1-12|null> } or null if it's not a period.
   Recognises the wild variety coaches actually type across a finance
   cross-tab:
     - month NAMES: Hebrew full/abbrev (ינואר / ינו / ינו׳), English
       full/abbrev (January / Jan),
     - month + YEAR in any order/separator, 2- or 4-digit
       (ינואר 2026 · Jan-26 · מרץ׳26 · 2026 ינואר),
     - numeric MM/YYYY · YYYY-MM · MM/YY,
     - QUARTERS: Q1 · q1 2026 · רבעון 1 · רבעון א׳ · רבעון ראשון · ר1 · ר"1,
     - HALF-years: H1/H2 · חציון 1 · מחצית א׳ · מחצית ראשונה,
     - "ordinal period": חודש 1 · תקופה 2 · מחזור 3,
     - period WORDS (חודשי/שנתי…) and a bare month number 1–12.
   Summary/total columns (סה״כ / סיכום שנתי / ממוצע / עד כה) deliberately
   match NOTHING here, so they're never flattened as a period (no double-
   counting). */
export function classifyPeriodHeader(header) {
  const raw = String(header == null ? '' : header).trim()
  if (!raw) return null
  const n = norm(raw)

  /* 1) bare month NAME (Hebrew full/abbrev or English). */
  const direct = monthFromToken(n)
  if (direct) return { period: raw, month: direct }

  /* 2) numeric MM/YYYY · MM/YY · MM.YY · YYYY-MM (a real separator, so a
     bare "1/26" stays month=1 rather than collapsing to "126"). */
  let m
  if ((m = raw.match(/^\s*(\d{4})\s*[/.-]\s*(\d{1,2})\s*$/))) {
    const mo = Number(m[2]); if (mo >= 1 && mo <= 12) return { period: raw, month: mo }
  }
  if ((m = raw.match(/^\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})\s*$/))) {
    const mo = Number(m[1]); if (mo >= 1 && mo <= 12) return { period: raw, month: mo }
  }

  /* 3) month NAME + year (either order, any separator, 2- or 4-digit, even
     glued like "מרץ׳26"). Tokenise, then try each token as a month name —
     with and without its trailing/leading digits. */
  const toks = raw.toLowerCase().replace(/['׳״"`]/g, '').replace(/[/.\-_]+/g, ' ').split(/\s+/).filter(Boolean)
  for (const t of toks) {
    const mo = monthFromToken(norm(t)) || monthFromToken(norm(t.replace(/\d+/g, '')))
    if (mo) return { period: raw, month: mo }
  }

  /* Separator-stripped form so a year glued on with any separator
     ("רבעון 1/2026" → "רבעון12026") doesn't defeat the matchers below. */
  const ns = n.replace(/[/.\-_]/g, '')

  /* 4) QUARTERS → the quarter's start month, tolerating a trailing year:
     q1 / q1 2026 / רבעון1 / ר1 / רבעוןא / רבעון ראשון. */
  let q
  if ((q = ns.match(/^q([1-4])(?:20\d{2}|\d{2})?$/))) return { period: raw, month: QUARTER_START[Number(q[1])] }
  if ((q = ns.match(/^(?:רבעון|רבע|ר)([1-4])(?:20\d{2}|\d{2})?$/))) return { period: raw, month: QUARTER_START[Number(q[1])] }
  if ((q = ns.match(/^(?:רבעון|רבע)([אבגד])$/))) return { period: raw, month: QUARTER_START[HE_LETTER_NUM[q[1]]] }
  if ((q = ns.match(/^(?:רבעון|רבע)(ראשון|שני|שלישי|רביעי)$/))) return { period: raw, month: QUARTER_START[HE_ORDINAL[q[1]]] }

  /* 5) HALF-years → start month (H1→Jan, H2→Jul). */
  let h
  if ((h = ns.match(/^h([12])(?:20\d{2}|\d{2})?$/))) return { period: raw, month: Number(h[1]) === 1 ? 1 : 7 }
  if ((h = ns.match(/^(?:חציון|מחצית|מחצ)([12])(?:20\d{2}|\d{2})?$/))) return { period: raw, month: Number(h[1]) === 1 ? 1 : 7 }
  if ((h = ns.match(/^(?:חציון|מחצית|מחצ)([אב]|ראשונה|שניה|שנייה)$/))) {
    const num = HE_LETTER_NUM[h[1]] || HE_ORDINAL[h[1]]
    if (num) return { period: raw, month: num === 1 ? 1 : 7 }
  }

  /* 6) "ordinal period": חודש 1 / תקופה 2 / מחזור 3 → that month number. */
  if ((m = ns.match(/^(?:חודש|תקופה|מחזור|period|month)([1-9]|1[0-2])$/))) {
    return { period: raw, month: Number(m[1]) }
  }

  /* 7) period WORD (חודשי/שנתי…) — a value column, no specific month. */
  if (PERIOD_WORDS.some((w) => norm(w) === n)) return { period: raw, month: null }

  /* 8) a bare month number 1–12. */
  if (/^\d{1,2}$/.test(n)) {
    const mo = Number(n)
    if (mo >= 1 && mo <= 12) return { period: raw, month: mo }
  }
  return null
}

export function isSummaryLabel(label) {
  const n = norm(label)
  if (!n) return false
  return SUMMARY_HINTS.some((h) => n === norm(h) || n.includes(norm(h)))
}

/* Detect whether a header row describes a matrix. Returns a descriptor:
     { isMatrix, labelCol, periodCols: [{ idx, period, month }], confidence }
   Heuristic: a matrix has one (usually first) text label column and ≥2
   period-looking columns covering most of the rest. */
export function detectMatrix(headers) {
  if (!Array.isArray(headers) || headers.length < 3) {
    return { isMatrix: false, labelCol: 0, periodCols: [], confidence: 0 }
  }
  const periodCols = []
  headers.forEach((h, idx) => {
    const c = classifyPeriodHeader(h)
    if (c) periodCols.push({ idx, period: c.period, month: c.month })
  })
  /* Label column = first non-period header (usually col 0). */
  const periodIdx = new Set(periodCols.map((p) => p.idx))
  let labelCol = headers.findIndex((h, i) => !periodIdx.has(i) && String(h || '').trim() !== '')
  if (labelCol < 0) labelCol = 0
  /* Matrix if ≥2 period columns AND they're the majority of non-label
     columns (so a flat table with one stray "מאי" note column isn't
     misread). */
  const nonLabel = headers.length - 1
  const confidence = nonLabel > 0 ? periodCols.length / nonLabel : 0
  const isMatrix = periodCols.length >= 2 && confidence >= 0.5
  return { isMatrix, labelCol, periodCols, confidence }
}

/* Flatten a matrix sheet into suggested transactions per an explicit
   config. Config:
     { labelCol, periodCols: [{idx, period, month}], skipRows: Set<rowIdx>,
       year, rowTypes: { [rowIdx]: 'income'|'expense' } }
   Each numeric, non-zero cell at (row, periodCol) → one transaction:
     { _row, _col, label, period, month, amount, type, date }
   Type is PER ROW (a sheet mixes income + expense rows): an explicit
   rowTypes override wins, else guessRowType(label). Rows in skipRows
   (summaries) are excluded. date is built from month + year when known. */
export function flattenMatrix(rows, config) {
  const { labelCol, periodCols, skipRows, year, rowTypes = {}, labelKind = 'category', recurring = false, recurringDay = 1 } = config
  const skip = skipRows instanceof Set ? skipRows : new Set(skipRows || [])
  const out = []
  const toNum = (v) => parseAmount(v)
  const pad = (x) => String(x).padStart(2, '0')

  rows.forEach((r, rowIdx) => {
    if (skip.has(rowIdx)) return
    const label = String(r[labelCol] == null ? '' : r[labelCol]).trim()
    if (!label) return
    const type = rowTypes[rowIdx] || guessRowType(label)
    periodCols.forEach(({ idx, period, month }) => {
      const amount = toNum(r[idx])
      if (Number.isNaN(amount) || amount === 0) return
      const date = (month && year) ? `${year}-${pad(month)}-01` : null
      out.push({
        _row: rowIdx,
        _col: idx,
        label,
        period,
        month: month || null,
        amount: Math.abs(amount),
        type,
        date,
        /* Rate-table rows (חודשי/שנתי, no real month) describe an ongoing
           cost — emit them as a RECURRING monthly rule instead of a dated
           one-off (which would be dropped for lacking a date). */
        recurring,
        cadence: recurring ? 'monthly_date' : null,
        day_of_month: recurring ? recurringDay : null,
        /* For income rows the label is a real linkable entity
           (project/client per labelKind); for expense rows it's just a
           category name, so we don't create a project/client from it. */
        labelKind: type === 'income' ? labelKind : 'category',
      })
    })
  })
  return out
}

/* Build the initial pivot config from a detected matrix + the data rows.
   Pre-fills label column, period columns, year (from the sheet name when
   given), pre-checks summary rows to skip, and pre-classifies each row's
   type (income/expense) from its label — all overridable in the UI. */
export function buildPivotConfig(headers, rows, detection, year) {
  const det = detection || detectMatrix(headers)
  /* If the label-column header marks the sheet as expenses (e.g.
     "הוצאה \\ מנוי"), every row is a cost — vendor-name labels won't
     match per-row expense hints, so default the whole sheet to expense. */
  const sheetIsExpense = isExpenseLabelHeader(headers[det.labelCol])
  /* Rate table: when the period columns are all non-month rate words
     (חודשי + שנתי …) the SAME figure is restated per period, so flattening
     every column double-counts. Keep ONE column — prefer the monthly rate
     (most granular / recurring), else the first. The user can still pick a
     different period in the UI. */
  let periodCols = det.periodCols
  const allRateWords = periodCols.length >= 2 && periodCols.every((p) => !p.month)
  let monthlyCol = null
  if (allRateWords) {
    monthlyCol = periodCols.find((p) => /חודשי|monthly/.test(norm(p.period)))
    periodCols = [monthlyCol || periodCols[0]]
  }
  /* A rate table with a MONTHLY column is an ongoing recurring cost
     (no dates) → import as a recurring monthly rule, not dated one-offs.
     Yearly-only rate tables stay one-offs (we have no yearly cadence). */
  const recurring = allRateWords && !!monthlyCol
  const skipRows = new Set()
  const rowTypes = {}
  rows.forEach((r, i) => {
    const label = r[det.labelCol]
    if (isSummaryLabel(label)) skipRows.add(i)
    rowTypes[i] = sheetIsExpense ? 'expense' : guessRowType(label)
  })
  return {
    layout: 'matrix',
    labelCol: det.labelCol,
    periodCols,
    skipRows: Array.from(skipRows),
    rowTypes,
    /* What the row labels are (project/client/category) — drives whether
       we create projects/clients and link transactions to them. */
    labelKind: guessLabelKind(headers[det.labelCol]),
    year: year || null,
    recurring,
    recurringDay: 1,
  }
}
