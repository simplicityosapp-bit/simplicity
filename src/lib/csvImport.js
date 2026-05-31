/* ════════════════════════════════════════════════════════════════
   CSV IMPORT — dependency-free CSV parser + entity extraction.
   ════════════════════════════════════════════════════════════════
   Used by the onboarding "I have data" path. We:
     1. Parse the file as CSV (quote-aware, no library).
     2. Auto-detect each column → a system field (Hebrew + English
        synonyms). Unmatched columns stay null so the UI can ask the
        user to map them by hand.
     3. Project rows into entity buckets — clients, projects, and
        SUGGESTED transactions (rows carrying amount + date).
   The mapping is the single source of truth: it is stored alongside
   the raw rows in `parsed_data`, and every screen (Step 2 manual
   mapping, Step 3 project confirm, Step 4 client confirm, and the
   final review wizard) edits its slice of the same mapping, then
   re-derives the entities via `projectEntities()`.
   The extraction is deliberately tolerant: missing/unknown columns are
   ignored, not rejected. Headers are matched in lowercase + with
   whitespace/punctuation stripped, so "Full Name", "full_name",
   "FullName" all collapse to "fullname".
   ════════════════════════════════════════════════════════════════ */

/* Canonical importable fields + their Hebrew labels (used by the
   mapping dropdowns) and which onboarding step "owns" confirming them.
   Fields with no `step` are confirmed in Step 2 right after upload —
   everything the onboarding flow does NOT collect on its own screens. */
export const CSV_FIELDS = [
  { key: 'name',      label: 'שם',              step: 'clients'  },
  { key: 'project',   label: 'פרויקט',          step: 'projects' },
  { key: 'sessions',  label: 'מספר פגישות',     step: 'clients'  },
  { key: 'price',     label: 'מחיר לפגישה',     step: 'clients'  },
  { key: 'email',     label: 'מייל',            step: null       },
  { key: 'phone',     label: 'טלפון',           step: null       },
  { key: 'status',    label: 'סטטוס',           step: null       },
  { key: 'amount',    label: 'סכום (תנועה)',    step: null       },
  { key: 'date',      label: 'תאריך (תנועה)',   step: null       },
  { key: 'type',      label: 'סוג (הכנסה/הוצאה)', step: null     },
  { key: 'notes',     label: 'הערות',           step: null       },
]

/* Max data rows we keep in `parsed_data` — it lives in the
   user_preferences JSONB blob, so we cap it to stay sane. The full
   file count is still reported (raw_rows) so the UI can say how many
   were skipped. */
export const ROW_CAP = 500

export const FIELD_LABEL = Object.fromEntries(CSV_FIELDS.map((f) => [f.key, f.label]))
const FIELD_STEP = Object.fromEntries(CSV_FIELDS.map((f) => [f.key, f.step]))

/* Which fields a given onboarding step confirms. Step 2 ("data_import")
   owns every field NOT claimed by a later step, plus unmapped columns. */
export function fieldsForStep(stepKey) {
  if (stepKey === 'all') return CSV_FIELDS.map((f) => f.key) /* in-app import: full mapping */
  if (stepKey === 'data_import') return CSV_FIELDS.filter((f) => f.step === null).map((f) => f.key)
  return CSV_FIELDS.filter((f) => f.step === stepKey).map((f) => f.key)
}

/* The columns a given step's mapping editor should show:
     - data_import (step 2): unmapped columns + columns mapped to a
       non-onboarding field.
     - projects / clients: columns mapped to a field that step owns.
   Each entry: { colIdx, header, field, sample } where `sample` is the
   first non-empty value down that column (so the user can recognise it). */
export function columnsForStep(parsed, stepKey) {
  if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.mapping)) return []
  const owned = new Set(fieldsForStep(stepKey))
  const sampleFor = (colIdx) => {
    for (const r of (parsed.rows || [])) {
      const v = (r[colIdx] || '').trim()
      if (v) return v
    }
    return ''
  }
  return parsed.headers
    .map((header, colIdx) => ({ colIdx, header, field: parsed.mapping[colIdx] || null, sample: sampleFor(colIdx) }))
    .filter(({ field }) => {
      if (stepKey === 'all') return true /* in-app: show every column */
      if (stepKey === 'data_import') return !field || owned.has(field)
      return owned.has(field)
    })
}

const HEADER_SYNONYMS = {
  name:       ['name', 'fullname', 'full_name', 'clientname', 'client', 'שם', 'שםמלא', 'שםהלקוח', 'לקוח'],
  email:      ['email', 'mail', 'emailaddress', 'אימייל', 'מייל', 'דוארא', 'דואראלקטרוני'],
  phone:      ['phone', 'mobile', 'tel', 'phonenumber', 'cell', 'טלפון', 'נייד', 'סלולרי', 'מספרטלפון'],
  project:    ['project', 'projectname', 'program', 'פרויקט', 'תוכנית', 'מסלול'],
  status:     ['status', 'state', 'סטטוס', 'מצב'],
  sessions:   ['sessions', 'session', 'totalsessions', 'meetings', 'numsessions', 'פגישות', 'מספרפגישות', 'מפגשים'],
  price:      ['price', 'priceperession', 'pricepersession', 'rate', 'sessionprice', 'מחיר', 'מחירלפגישה', 'תעריף'],
  amount:     ['amount', 'sum', 'total', 'paid', 'payment', 'income', 'revenue', 'סכום', 'תשלום', 'שולם', 'סהכ', 'סךהכל', 'הכנסה'],
  date:       ['date', 'transactiondate', 'paymentdate', 'paydate', 'תאריך', 'תאריךתשלום', 'תאריךעסקה', 'תאריךתנועה'],
  type:       ['type', 'kind', 'סוג', 'סוגתנועה'],
  notes:      ['notes', 'note', 'comment', 'comments', 'remark', 'הערה', 'הערות', 'תיאור'],
}

/* Transaction type text (Hebrew + English) → income | expense. */
const TYPE_MAP = {
  income: 'income', 'הכנסה': 'income', 'זיכוי': 'income', 'credit': 'income',
  expense: 'expense', 'הוצאה': 'expense', 'חיוב': 'expense', 'debit': 'expense',
}

/* Map of status text (Hebrew + English) → app status_meta. Unknown
   strings fall back to 'active'. */
const STATUS_MAP = {
  active: 'active', 'פעיל': 'active', 'פעילה': 'active', 'פעיל/ת': 'active',
  wandering: 'wandering', 'נודד': 'wandering', 'נודדת': 'wandering', 'ביניים': 'wandering',
  past: 'past', 'לשעבר': 'past', 'former': 'past', 'inactive': 'past',
  no_status: 'no_status', 'ללאסטטוס': 'no_status',
}

function normalizeHeader(h) {
  if (!h) return ''
  return String(h)
    .trim()
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[\s\-_.]+/g, '')
    .replace(/[״׳]/g, '')
}

function pickField(normalized) {
  if (!normalized) return null
  for (const [field, syns] of Object.entries(HEADER_SYNONYMS)) {
    if (syns.some((s) => normalizeHeader(s) === normalized)) return field
  }
  return null
}

/* Best-effort date normalizer → 'YYYY-MM-DD' or null. Accepts ISO,
   DD/MM/YYYY, DD/MM/YY, DD.MM.YYYY, DD-MM-YYYY (day-first, the IL
   convention). Returns null when it can't make a valid date. */
export function normalizeDate(input) {
  if (!input) return null
  /* Drop a trailing time part ("2026-05-12 14:30" / "...T14:30") that
     spreadsheet datetime exports add, then parse the date alone. */
  const s = String(input).trim().split(/[ T]/)[0]
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (m) {
    let [, d, mo, y] = m
    d = Number(d); mo = Number(mo); y = Number(y)
    if (y < 100) y += y < 70 ? 2000 : 1900
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    const pad = (n) => String(n).padStart(2, '0')
    return `${y}-${pad(mo)}-${pad(d)}`
  }
  return null
}

const toNum = (v) => {
  if (v == null) return NaN
  const n = Number(String(v).replace(/[^\d.\-]/g, ''))
  return Number.isNaN(n) ? NaN : n
}

/* Sniff the delimiter from the header line. Israeli spreadsheet exports
   frequently use ';' (or a tab) instead of ','. We pick whichever
   appears most in the first non-empty line. */
function detectDelimiter(text) {
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim().length > 0)) || ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQ = false
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ
    else if (!inQ && counts[ch] !== undefined) counts[ch] += 1
  }
  let best = ','
  for (const d of [';', '\t']) if (counts[d] > counts[best]) best = d
  return best
}

/* Quote-aware CSV parser. Handles double-quoted cells with the
   delimiter/newlines inside; an embedded "" inside a quoted cell
   becomes a single ". Delimiter is sniffed (',' / ';' / tab). Not
   RFC4180-perfect, just good enough for spreadsheet-exported files. */
function parseCsv(text, delimiter = ',') {
  const rows = []
  let cur = ''
  let row = []
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1 } else { inQuotes = false }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cur); cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cur); cur = ''
      if (row.some((c) => c.trim().length > 0)) rows.push(row)
      row = []
    } else {
      cur += ch
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur)
    if (row.some((c) => c.trim().length > 0)) rows.push(row)
  }
  return rows
}

/* Decode a file's bytes to text, tolerant of the two encodings Israeli
   spreadsheet exports usually produce: UTF-8 (with/without BOM) and
   Windows-1255 (legacy Hebrew). We decode as UTF-8 first; if that
   yields the replacement char (), we re-decode as windows-1255. */
async function decodeFile(file) {
  const buf = await file.arrayBuffer()
  let text = new TextDecoder('utf-8').decode(buf)
  if (text.includes('�')) {
    try { text = new TextDecoder('windows-1255').decode(buf) } catch { /* keep utf-8 */ }
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1) /* strip BOM */
  return text
}

/* Project raw rows into entity buckets given a column→field mapping
   (an array aligned with `headers`; each entry is a field key or null).
   PURE + deterministic — same (headers, rows, mapping) always yields
   the same entities, so every screen that edits the mapping can call
   this and agree. Each entity carries `_row` (its source row index) so
   the review wizard can address rows stably for approve/edit/reject. */
export function projectEntities(headers, rows, mapping) {
  const clients = []
  const projectNames = new Set()
  const transactions = []
  let transactionIssues = 0 /* rows that look like a transaction but have a bad amount/date */
  const fieldByIdx = Array.isArray(mapping) ? mapping : []

  rows.forEach((r, rowIdx) => {
    const obj = {}
    fieldByIdx.forEach((field, i) => {
      if (!field) return
      const val = (r[i] || '').trim()
      if (val && obj[field] === undefined) obj[field] = val /* first non-empty wins */
    })

    if (obj.project) projectNames.add(obj.project)

    if (obj.name) {
      const status_meta = STATUS_MAP[normalizeHeader(obj.status || '')] || 'active'
      clients.push({
        _row: rowIdx,
        name: obj.name,
        email: obj.email || null,
        phone: obj.phone || null,
        project_name: obj.project || null,
        status_meta,
        sessions: Math.abs(Math.trunc(toNum(obj.sessions))) || 0,
        price_per_session: Math.abs(toNum(obj.price)) || 0,
        notes: obj.notes || null,
      })
    }

    /* A row carrying an amount + a parseable date → a SUGGESTED income
       transaction. The user decides per-row in the review wizard
       whether to actually create it. If the row HAS both an amount and
       a date value but one is invalid, count it as an issue so the UI
       can tell the user it was dropped instead of vanishing silently. */
    const hasAmount = obj.amount != null && String(obj.amount).trim() !== ''
    const hasDate = obj.date != null && String(obj.date).trim() !== ''
    const amountNum = hasAmount ? toNum(obj.amount) : NaN
    const isoDate = normalizeDate(obj.date)
    if (!Number.isNaN(amountNum) && amountNum !== 0 && isoDate) {
      /* Type: an explicit "סוג" column wins (so export→import round-trips
         expenses correctly); otherwise fall back to the amount's sign. */
      const mappedType = obj.type ? TYPE_MAP[normalizeHeader(obj.type)] : null
      transactions.push({
        _row: rowIdx,
        amount: Math.abs(amountNum),
        type: mappedType || (amountNum < 0 ? 'expense' : 'income'),
        date: isoDate,
        date_raw: obj.date || null,
        /* Description: prefer a real notes column; otherwise leave empty
           — the client link already carries who it's from, so defaulting
           to the client name would just duplicate it. */
        desc: obj.notes || null,
        client_name: obj.name || null,
        project_name: obj.project || null,
      })
    } else if (hasAmount && hasDate) {
      transactionIssues += 1
    }
  })

  return {
    clients,
    projects: Array.from(projectNames).map((n) => ({ name: n })),
    transactions,
    transaction_issues: transactionIssues,
  }
}

/* Apply a manual remap: assign `field` (or null to ignore) to column
   `colIdx`. Keeps the mapping 1:1 — if `field` was on another column,
   that other column is cleared. Returns a fresh parsed_data object with
   the entities re-derived. Safe on the legacy shape (no rows/mapping):
   returns the input unchanged. */
export function remapColumn(parsed, colIdx, field) {
  if (!parsed || !Array.isArray(parsed.rows) || !Array.isArray(parsed.mapping)) return parsed
  const mapping = parsed.mapping.slice()
  if (field) {
    /* enforce single-column-per-field */
    mapping.forEach((f, i) => { if (f === field && i !== colIdx) mapping[i] = null })
  }
  mapping[colIdx] = field || null
  const derived = projectEntities(parsed.headers || [], parsed.rows, mapping)
  const unmapped_columns = (parsed.headers || []).filter((h, i) => !mapping[i])
  return { ...parsed, mapping, unmapped_columns, ...derived }
}

/* Read + parse a File. Resolves to the full parsed_data payload:
   { kind, file_name, headers, rows, mapping, unmapped_columns,
     raw_rows, clients, projects, transactions }. Empty buckets on an
   empty file rather than throwing — the caller decides how to surface
   that. */
export async function parseCsvFile(file) {
  if (!file) return null
  const text = await decodeFile(file)
  const rows = parseCsv(text, detectDelimiter(text))
  if (rows.length === 0) {
    return {
      file_name: file.name,
      headers: [], rows: [], mapping: [], unmapped_columns: [],
      raw_rows: 0, clients: [], projects: [], transactions: [],
    }
  }
  const headers = rows[0].map((h) => (h || '').trim())
  const mapping = headers.map((h) => pickField(normalizeHeader(h)))
  const allDataRows = rows.slice(1)
  const dataRows = allDataRows.slice(0, ROW_CAP) /* cap what we persist to JSONB */
  const unmapped_columns = headers.filter((h, i) => !mapping[i])
  const derived = projectEntities(headers, dataRows, mapping)

  return {
    file_name: file.name,
    headers,
    rows: dataRows,
    mapping,
    unmapped_columns,
    raw_rows: allDataRows.length,
    truncated: allDataRows.length > ROW_CAP,
    row_cap: ROW_CAP,
    ...derived,
  }
}
