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

/* Hebrew month names → 1-based month number. Covers full names; the
   detector also accepts numeric/date-like headers. */
export const HE_MONTHS = {
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
  'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
}

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

/* Classify a single header cell as a period column. Returns
   { period: <label>, month: <1-12|null> } or null if it's not a period. */
export function classifyPeriodHeader(header) {
  const raw = String(header == null ? '' : header).trim()
  if (!raw) return null
  const n = norm(raw)
  /* Hebrew month name */
  for (const [name, num] of Object.entries(HE_MONTHS)) {
    if (norm(name) === n) return { period: raw, month: num }
  }
  /* Period word (חודשי/שנתי…) */
  if (PERIOD_WORDS.some((w) => norm(w) === n)) return { period: raw, month: null }
  /* A bare month number 1–12 */
  if (/^\d{1,2}$/.test(n)) {
    const m = Number(n)
    if (m >= 1 && m <= 12) return { period: raw, month: m }
  }
  /* MM/YYYY or YYYY-MM style */
  const ym = raw.match(/^(\d{4})[-/](\d{1,2})$/) || raw.match(/^(\d{1,2})[-/](\d{4})$/)
  if (ym) {
    const a = Number(ym[1]); const b = Number(ym[2])
    const month = a > 12 ? b : a
    if (month >= 1 && month <= 12) return { period: raw, month }
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
  const { labelCol, periodCols, skipRows, year, rowTypes = {}, labelKind = 'category' } = config
  const skip = skipRows instanceof Set ? skipRows : new Set(skipRows || [])
  const out = []
  const toNum = (v) => {
    if (v == null) return NaN
    const n = Number(String(v).replace(/[^\d.\-]/g, ''))
    return Number.isNaN(n) ? NaN : n
  }
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
  const skipRows = new Set()
  const rowTypes = {}
  rows.forEach((r, i) => {
    const label = r[det.labelCol]
    if (isSummaryLabel(label)) skipRows.add(i)
    rowTypes[i] = guessRowType(label)
  })
  return {
    layout: 'matrix',
    labelCol: det.labelCol,
    periodCols: det.periodCols,
    skipRows: Array.from(skipRows),
    rowTypes,
    /* What the row labels are (project/client/category) — drives whether
       we create projects/clients and link transactions to them. */
    labelKind: guessLabelKind(headers[det.labelCol]),
    year: year || null,
  }
}
