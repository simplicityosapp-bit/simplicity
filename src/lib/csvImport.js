/* ════════════════════════════════════════════════════════════════
   CSV IMPORT — dependency-free CSV parser + entity extraction.
   ════════════════════════════════════════════════════════════════
   Used by the onboarding "I have data" path. We:
     1. Parse the file as CSV (quote-aware, no library).
     2. Normalize headers (Hebrew + English variants).
     3. Project rows into best-guess entity buckets — clients (primary),
        projects (from a "project" column), and a `raw` array preserved
        for follow-up tooling.
   The extraction is deliberately tolerant: missing/unknown columns are
   ignored, not rejected. Headers are matched in lowercase + with
   whitespace/punctuation stripped, so "Full Name", "full_name",
   "FullName" all collapse to "full_name".
   ════════════════════════════════════════════════════════════════ */

const HEADER_SYNONYMS = {
  name:       ['name', 'fullname', 'full_name', 'שם', 'שםמלא'],
  email:      ['email', 'mail', 'אימייל', 'מייל', 'דוארא'],
  phone:      ['phone', 'mobile', 'tel', 'טלפון', 'נייד', 'סלולרי'],
  project:    ['project', 'projectname', 'פרויקט'],
  status:     ['status', 'סטטוס'],
  sessions:   ['sessions', 'session', 'totalsessions', 'פגישות', 'מספרפגישות'],
  price:      ['price', 'priceperession', 'pricepersession', 'rate', 'מחיר', 'מחירלפגישה'],
  notes:      ['notes', 'note', 'comment', 'comments', 'הערה', 'הערות'],
  joined_at:  ['joinedat', 'startdate', 'joined', 'תאריךתחילה', 'תאריךהצטרפות'],
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
  for (const [field, syns] of Object.entries(HEADER_SYNONYMS)) {
    if (syns.some((s) => normalizeHeader(s) === normalized)) return field
  }
  return null
}

/* Quote-aware CSV line parser. Handles double-quoted cells with
   commas/newlines inside; an embedded "" inside a quoted cell
   becomes a single ". Doesn't try to be RFC4180-perfect, just good
   enough for spreadsheet-exported files. */
function parseCsv(text) {
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
    } else if (ch === ',') {
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

/* Read + parse a File. Resolves to {clients, projects, raw_rows, headers,
   unmapped_columns}. Empty arrays on failure rather than throwing —
   the caller decides how to surface that. */
export async function parseCsvFile(file) {
  if (!file) return null
  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length === 0) {
    return { clients: [], projects: [], raw_rows: [], headers: [], unmapped_columns: [], file_name: file.name }
  }
  const headerRow = rows[0]
  const headers = headerRow.map((h) => (h || '').trim())
  const fieldByIdx = headers.map((h) => pickField(normalizeHeader(h)))
  const unmapped = headers.filter((h, i) => !fieldByIdx[i])
  const dataRows = rows.slice(1)

  const clients = []
  const projectNames = new Set()
  for (const r of dataRows) {
    const obj = {}
    fieldByIdx.forEach((field, i) => {
      if (!field) return
      const val = (r[i] || '').trim()
      if (val) obj[field] = val
    })
    if (!obj.name) continue /* no name = not a client row */
    if (obj.project) projectNames.add(obj.project)
    const status_meta = STATUS_MAP[normalizeHeader(obj.status || '')] || 'active'
    clients.push({
      name: obj.name,
      email: obj.email || null,
      phone: obj.phone || null,
      project_name: obj.project || null,
      status_meta,
      sessions: obj.sessions ? Number(obj.sessions) || 0 : 0,
      price_per_session: obj.price ? Number(obj.price) || 0 : 0,
      notes: obj.notes || null,
      joined_at: obj.joined_at || null,
    })
  }

  return {
    file_name: file.name,
    headers,
    unmapped_columns: unmapped,
    raw_rows: dataRows.length,
    clients,
    projects: Array.from(projectNames).map((n) => ({ name: n })),
  }
}
