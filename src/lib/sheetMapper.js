/* ════════════════════════════════════════════════════════════════
   SHEET MAPPER — unified "detect what you can, ask the rest" import.
   ════════════════════════════════════════════════════════════════
   One engine for EVERY shape a coach might upload:
     - multi-sheet workbooks where each sheet is an ENTITY
       (לקוחות / פרויקטים / לידים / תשלומים) — Notion-style,
     - multi-sheet workbooks where each sheet is a YEAR (matrix),
     - single flat CSVs.
   For each sheet we:
     1. Guess its ENTITY TYPE from the sheet name (clients / projects /
        leads / transactions / matrix / ignore) — overridable.
     2. Guess each COLUMN's field from the header — anything we can't
        place is left `null` so the UI asks the user (never dropped).
     3. Expose a per-sheet, fully-editable mapping. Nothing is created
        until the user confirms in review.
   Matrix sheets defer to pivotImport; this module owns flat + routing.
   ════════════════════════════════════════════════════════════════ */

import { detectMatrix } from './pivotImport'
import { detectColumnType, parseAmount } from './columnDetect'
import { normalizeDate } from './csvImport'
import { mapValueToMetaConfident } from './statusImport'

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/["'`״׳]/g, '').replace(/[\s\-_.]+/g, '')

/* Map a content-detected column type → the entity field it implies, per
   entity. e.g. a 'phone' column → the entity's `phone` field. Returns
   null when the entity has no field for that type. */
const CONTENT_TYPE_FIELD = {
  clients:      { phone: 'phone', email: 'email', status: 'status', date: null,  amount: 'income', name: 'name' },
  projects:     { phone: null,    email: null,    status: null,     date: null,  amount: null,     name: 'name' },
  leads:        { phone: 'phone', email: 'email', status: 'status', date: 'date', amount: null,    name: 'name' },
  transactions: { phone: null,    email: null,    status: 'status', date: 'date', amount: 'amount', name: 'client' },
  sessions:     { phone: null,    email: null,    status: null,     date: 'date', amount: null,     name: 'client' },
}

/* Entity types a sheet can map to. 'matrix' = cross-tab (months as
   columns); 'ignore' = summary/empty sheets we skip by default.
   'sessions' = a HELD-meeting ledger (one row per past session). */
export const SHEET_TYPES = ['clients', 'projects', 'leads', 'transactions', 'sessions', 'matrix', 'ignore']
export const SHEET_TYPE_LABELS = {
  clients: 'לקוחות',
  projects: 'פרויקטים',
  leads: 'לידים',
  transactions: 'תנועות / תשלומים',
  sessions: 'יומן פגישות',
  matrix: 'טבלת חודשים',
  ignore: 'להתעלם',
}

/* Sheet-name → entity hints. */
const SHEET_NAME_HINTS = {
  clients:      ['לקוח', 'לקוחות', 'client', 'clients', 'customer', 'מטופל', 'חניך'],
  projects:     ['פרויקט', 'פרוייקט', 'פרויקטים', 'project', 'projects', 'program'],
  leads:        ['ליד', 'לידים', 'lead', 'leads', 'פניות', 'מתעניינים'],
  transactions: ['תשלום', 'תשלומים', 'הכנס', 'הוצא', 'תנוע', 'payment', 'transaction', 'income', 'expense', 'finance', 'כספים'],
  sessions:     ['יומןפגישות', 'יומןמפגשים', 'פגישותשהתקיימו', 'מפגשים', 'meetings', 'sessions', 'sessionlog'],
  ignore:       ['סיכום', 'summary', 'דאשבורד', 'dashboard', 'הוראות', 'readme', 'info'],
}

/* Per-entity column-field catalogs. Each field: key + Hebrew label +
   header synonyms. The UI offers these in the column dropdown; auto-map
   matches a header to the first field whose synonym equals it. */
export const ENTITY_FIELDS = {
  clients: [
    { key: 'name',      label: 'שם הלקוח',        syn: ['שם', 'שםלקוח', 'שםהלקוח', 'name', 'fullname', 'client'] },
    { key: 'status',    label: 'סטטוס',           syn: ['סטטוס', 'status', 'מצב', 'סטטוסלקוח'] },
    { key: 'phone',     label: 'טלפון',           syn: ['טלפון', 'נייד', 'phone', 'mobile'] },
    { key: 'email',     label: 'אימייל',          syn: ['אימייל', 'מייל', 'email', 'mail'] },
    { key: 'sessions',  label: 'פגישות שנרכשו',   syn: ['פגישותשנרכשו', 'פגישות', 'מפגשים', 'sessions'] },
    { key: 'sessions_done', label: 'פגישות שנעשו', syn: ['פגישותשנעשו', 'בוצעו'] },
    { key: 'income',    label: 'סך הכנסה',        syn: ['סךהכנסה', 'הכנסה', 'income', 'revenue'] },
    { key: 'paid',      label: 'שולם',            syn: ['שולם', 'paid'] },
    { key: 'total_due', label: 'סה״כ לתשלום',     syn: ['סהכלתשלום', 'סךלתשלום', 'לתשלום', 'totaldue', 'totaltopay'] },
    /* Remaining balance — RECOGNISED but intentionally NOT imported: the
       app computes balance itself (total − paid). Mapping a column here
       tells the user "we see this column, and we compute it ourselves". */
    { key: 'computed_balance', label: 'יתרה לתשלום (מחושב אוטומטית)', syn: ['יתרהלתשלום', 'יתרה', 'נותרלתשלום', 'יתרתחוב', 'balance', 'outstanding', 'remaining', 'owed'] },
    { key: 'project',   label: 'פרויקט',          syn: ['פרויקט', 'פרוייקט', 'project'] },
    { key: 'notes',     label: 'הערות',           syn: ['הערות', 'הערה', 'notes', 'note'] },
  ],
  projects: [
    { key: 'name',     label: 'שם הפרויקט',      syn: ['שם', 'שםפרויקט', 'שםהפרויקט', 'project', 'name'] },
    { key: 'subprojects', label: 'תתי פרויקטים', syn: ['תתיפרויקטים', 'תתפרויקט', 'subprojects'] },
    { key: 'client_count', label: 'מספר לקוחות', syn: ['מספרלקוחות', 'לקוחות', 'clients'] },
    { key: 'notes',    label: 'הערות',           syn: ['הערות', 'notes'] },
  ],
  leads: [
    { key: 'name',     label: 'שם',              syn: ['שם', 'שםליד', 'name', 'fullname'] },
    { key: 'status',   label: 'סטטוס',           syn: ['סטטוס', 'status', 'שלב', 'stage'] },
    { key: 'category', label: 'קטגוריה',         syn: ['קטגוריה', 'category'] },
    { key: 'source',   label: 'מקור',            syn: ['מקור', 'source'] },
    { key: 'project',  label: 'פרויקט',          syn: ['פרויקט', 'פרוייקט', 'project'] },
    { key: 'date',     label: 'תאריך',           syn: ['תאריך', 'date', 'תאריךפנייה', 'inquirydate'] },
    { key: 'phone',    label: 'טלפון',           syn: ['טלפון', 'נייד', 'phone'] },
    { key: 'email',    label: 'אימייל',          syn: ['אימייל', 'מייל', 'email'] },
    { key: 'notes',    label: 'הערות',           syn: ['הערות', 'הערה', 'notes'] },
  ],
  transactions: [
    { key: 'client',   label: 'שם לקוח',         syn: ['שםלקוח', 'לקוח', 'client', 'name'] },
    { key: 'amount',   label: 'סכום',            syn: ['סכום', 'amount', 'סךהכנסה', 'הכנסה', 'income'] },
    { key: 'paid',     label: 'שולם',            syn: ['שולם', 'paid'] },
    { key: 'balance',  label: 'יתרה',            syn: ['יתרה', 'יתרהלתשלום', 'balance'] },
    { key: 'status',   label: 'סטטוס',           syn: ['סטטוס', 'status', 'סטטוסלקוח'] },
    { key: 'type',     label: 'סוג (הכנסה/הוצאה)', syn: ['סוג', 'type'] },
    { key: 'date',     label: 'תאריך',           syn: ['תאריך', 'date'] },
    { key: 'project',  label: 'פרויקט',          syn: ['פרויקט', 'פרוייקט', 'project'] },
    { key: 'notes',    label: 'הערות',           syn: ['הערות', 'notes'] },
  ],
  /* A HELD-session ledger: one row = one past meeting. client + date are
     the essentials; summary/notes optional. The session NUMBER is assigned
     automatically (continuing from any sessions already logged). */
  sessions: [
    { key: 'client',  label: 'שם לקוח', syn: ['שםלקוח', 'לקוח', 'client', 'name', 'מטופל', 'חניך'] },
    { key: 'date',    label: 'תאריך',   syn: ['תאריך', 'date', 'תאריךפגישה', 'מועד', 'תאריךמפגש'] },
    { key: 'summary', label: 'סיכום',   syn: ['סיכום', 'summary', 'תקציר'] },
    { key: 'notes',   label: 'הערות',   syn: ['הערות', 'הערה', 'notes', 'note'] },
  ],
}

/* Score a header row against an entity's vocabulary — how many of the
   entity's fields have a synonym present among the headers. Used to guess
   the entity type by CONTENT when the sheet name gives no hint. */
function entityHeaderScore(entityType, headers) {
  const fields = ENTITY_FIELDS[entityType] || []
  const nh = (headers || []).map(norm).filter(Boolean)
  let hits = 0
  fields.forEach((f) => {
    if (f.syn.some((s) => { const ns = norm(s); return ns.length >= 3 && nh.some((h) => h === ns || h.includes(ns) || ns.includes(h)) })) hits += 1
  })
  return hits
}

/* Tell-tale columns that strongly mark an entity even with a generic
   sheet name (a "מקור"/"קטגוריה" column → leads; "סכום"+"תאריך" →
   transactions). Checked before the generic clients fallback. */
function guessTypeByContent(headers, rows) {
  const nh = (headers || []).map(norm)
  const has = (...syns) => syns.some((s) => nh.some((h) => h.includes(norm(s))))
  const dated = hasDateColumn(headers, rows)
  /* Transactions: an amount-ish column AND a date-ish column. */
  if (has('סכום', 'amount', 'תשלום') && dated) return 'transactions'
  /* Leads: lead-specific columns. */
  if (has('מקור', 'source', 'פנייה', 'inquiry') || (has('קטגוריה', 'category') && has('סטטוס', 'status'))) return 'leads'
  /* Clients: session/price columns. */
  if (has('פגישות', 'מפגשים', 'sessions', 'מחיר', 'price')) return 'clients'
  /* Fall back to whichever entity's vocabulary the headers best match.
     A dateless sheet can't be a transactions LEDGER (it's a per-entity
     summary), so transactions only competes when a date column exists —
     otherwise an amounts-per-client table wrongly wins over clients. */
  const candidates = dated ? ['clients', 'leads', 'transactions', 'projects'] : ['clients', 'leads', 'projects']
  const scored = candidates
    .map((t) => ({ t, score: entityHeaderScore(t, headers) }))
    .sort((a, b) => b.score - a.score)
  return scored[0].score > 0 ? scored[0].t : 'clients'
}

/* Does the sheet have a date column? A real transactions LEDGER has
   dates; an amounts-per-entity table without dates (e.g. a "תשלומים"
   summary of סך-הכנסה/שולם per client) is a roster, not a ledger — and
   would otherwise double-count against a dated income source. Checks the
   header text first, then the column VALUES. */
function hasDateColumn(headers, rows) {
  const nh = (headers || []).map(norm)
  if (nh.some((h) => h.includes('תאריך') || h.includes('date'))) return true
  for (let i = 0; i < (headers || []).length; i += 1) {
    if (!String(headers[i] || '').trim()) continue
    const { type, confidence } = detectColumnType(rows || [], i)
    if (type === 'date' && confidence >= 0.6) return true
  }
  return false
}

/* Guess a sheet's entity type. Order: empty → ignore; matrix detection;
   sheet-name hint; then CONTENT (columns) instead of a blind default. */
export function guessSheetType(sheetName, headers, rows) {
  const n = norm(sheetName)
  /* Empty / near-empty sheet → ignore. */
  const nonEmpty = (rows || []).filter((r) => (r || []).some((c) => String(c).trim() !== ''))
  if (nonEmpty.length === 0) return 'ignore'
  /* Name hints first. */
  for (const [type, hints] of Object.entries(SHEET_NAME_HINTS)) {
    if (hints.some((h) => n.includes(norm(h)))) {
      if (type === 'transactions') {
        /* A finance-named cross-tab (months as columns) → matrix. */
        if (detectMatrix(headers || []).isMatrix) return 'matrix'
        /* A finance-named sheet with NO date column isn't a ledger —
           defer to content typing (it's usually a per-client summary that
           belongs with the clients, and creating income from it would
           double-count a dated income source). */
        if (!hasDateColumn(headers, rows)) break
      }
      return type
    }
  }
  /* Cross-tab? */
  if (detectMatrix(headers || []).isMatrix) return 'matrix'
  /* No name hint → decide by the columns, not a blind 'clients'. */
  return guessTypeByContent(headers, rows)
}

/* Match a single header to a field by synonym — exact first, then
   partial (header contains a synonym or vice-versa, for ≥3-char syns so
   "שם" doesn't swallow everything). Returns a field key or null. */
function matchHeaderToField(nh, fields, used) {
  if (!nh) return null
  /* 1) exact synonym match */
  for (const f of fields) {
    if (used.has(f.key)) continue
    if (f.syn.some((s) => norm(s) === nh)) return f.key
  }
  /* 2) partial: the HEADER contains a synonym (≥3 chars), e.g. "שם מלא"
     contains "שם"… but we DON'T match the reverse direction (a synonym
     containing the header), which wrongly maps short headers like "מי"
     onto "מייל". Header must also be ≥2 chars to avoid noise. */
  if (nh.length >= 2) {
    for (const f of fields) {
      if (used.has(f.key)) continue
      if (f.syn.some((s) => { const ns = norm(s); return ns.length >= 3 && nh.includes(ns) })) return f.key
    }
  }
  return null
}

/* Auto-map a header row to an entity's fields. Three passes, in order:
     1. header → field by synonym (exact, then partial),
     2. for still-unmapped columns, classify by VALUES (phone/email/date/
        amount/status/name) and map that to the entity's field,
   Anything still unplaced stays null (the UI asks the user).
   `rows` (data rows) enables the content pass; omit for header-only. */
export function autoMapColumns(entityType, headers, rows = []) {
  const fields = ENTITY_FIELDS[entityType] || []
  const used = new Set()
  const mapping = (headers || []).map((h) => {
    const field = matchHeaderToField(norm(h), fields, used)
    if (field) used.add(field)
    return field
  })
  /* Content pass — fill the gaps from the column values. */
  const typeToField = CONTENT_TYPE_FIELD[entityType] || {}
  ;(headers || []).forEach((h, idx) => {
    if (mapping[idx] || !String(h || '').trim()) return
    if (!rows.length) return
    const { type, confidence } = detectColumnType(rows, idx)
    const field = typeToField[type]
    if (field && !used.has(field) && confidence >= 0.6) { mapping[idx] = field; used.add(field) }
  })
  return mapping
}

/* Find the real header row. Spreadsheets from the wild often open with a
   title banner, a logo row, an export-date line, or blank rows before the
   actual column headers. We scan the first ~10 rows and pick the best
   header candidate: the row with the most non-empty cells that look like
   headers (short, mostly text, mostly distinct) and whose NEXT row also
   has data. Returns the row index (0 if nothing better is found). */
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

/* Build a fully-editable sheet descriptor: type + headers + rows +
   column mapping + the count of columns we couldn't place (so the UI
   can surface "N columns need you"). The header row is detected (not
   assumed to be row 0) so title/banner rows don't break the mapping. */
export function buildSheetMapping(fileName, sheetName, rows) {
  const headerIdx = findHeaderRow(rows || [])
  const headers = (rows[headerIdx] || []).map((h) => (h == null ? '' : String(h)).trim())
  const dataRows = rows.slice(headerIdx + 1)
  const type = guessSheetType(sheetName, headers, dataRows)
  const mapping = type === 'matrix' || type === 'ignore' ? [] : autoMapColumns(type, headers, dataRows)
  const unmapped = mapping.filter((m, i) => headers[i] && !m).length
  return {
    id: `${fileName}::${sheetName || ''}`,
    fileName,
    sheetName: sheetName || null,
    type,
    headers,
    rows: dataRows,
    mapping,
    unmappedCount: unmapped,
  }
}

/* Re-map: set column `colIdx` to `field` (or null). Enforces 1:1 per
   field within the sheet. Returns a fresh sheet object. */
export function remapSheetColumn(sheet, colIdx, field) {
  const mapping = (sheet.mapping || []).slice()
  if (field) mapping.forEach((f, i) => { if (f === field && i !== colIdx) mapping[i] = null })
  mapping[colIdx] = field || null
  const unmapped = mapping.filter((m, i) => sheet.headers[i] && !m).length
  return { ...sheet, mapping, unmappedCount: unmapped }
}

/* Change a sheet's entity type — re-runs auto-map for the new type. */
export function setSheetType(sheet, type) {
  const mapping = type === 'matrix' || type === 'ignore' ? [] : autoMapColumns(type, sheet.headers, sheet.rows)
  const unmapped = mapping.filter((m, i) => sheet.headers[i] && !m).length
  return { ...sheet, type, mapping, unmappedCount: unmapped }
}

/* Project a mapped flat sheet into entity rows for the review wizard.
   Returns { clients, projects, leads, transactions } slices (only the
   one matching the sheet type is populated). Pure + deterministic. */
export function projectSheet(sheet) {
  const out = { clients: [], projects: [], leads: [], transactions: [], sessions: [] }
  if (!sheet || sheet.type === 'ignore' || sheet.type === 'matrix') return out
  const fieldAt = {}
  ;(sheet.mapping || []).forEach((f, i) => { if (f) fieldAt[f] = i })
  const val = (r, key) => (fieldAt[key] != null ? String(r[fieldAt[key]] ?? '').trim() : '')
  const num = (r, key) => { const n = parseAmount(val(r, key)); return Number.isNaN(n) ? 0 : n }

  sheet.rows.forEach((r, rowIdx) => {
    if (sheet.type === 'clients') {
      const name = val(r, 'name')
      if (!name) return
      const sessions = num(r, 'sessions')
      const income = num(r, 'income')
      /* Derive a per-session price from total income ÷ purchased sessions
         when both are present (the sheet rarely lists a rate directly). */
      const price = sessions > 0 && income > 0 ? Math.round(income / sessions) : 0
      const cStatus = val(r, 'status')
      out.clients.push({
        _row: `${sheet.id}#${rowIdx}`,
        name,
        status_name: cStatus || null,
        /* true when we couldn't confidently map the status → the wizard
           highlights it for the user to confirm, instead of guessing. */
        status_unsure: !!cStatus && !mapValueToMetaConfident(cStatus, 'client').confident,
        phone: val(r, 'phone') || null,
        email: val(r, 'email') || null,
        sessions,
        sessions_done: num(r, 'sessions_done'),
        income,
        paid: num(r, 'paid'),
        /* "סה״כ לתשלום" — the client's total amount due. Drives the
           client total (overrides sessions×price) so the balance the
           coach already tracks carries over verbatim. */
        total_due: num(r, 'total_due'),
        price_per_session: price,
        project_name: val(r, 'project') || null,
        notes: val(r, 'notes') || null,
      })
    } else if (sheet.type === 'projects') {
      const name = val(r, 'name')
      if (!name) return
      out.projects.push({ _row: `${sheet.id}#${rowIdx}`, name, notes: val(r, 'notes') || null })
    } else if (sheet.type === 'leads') {
      const name = val(r, 'name')
      if (!name) return
      const rawDate = val(r, 'date')
      const lStatus = val(r, 'status')
      out.leads.push({
        _row: `${sheet.id}#${rowIdx}`,
        name,
        status_name: lStatus || null,
        status_unsure: !!lStatus && !mapValueToMetaConfident(lStatus, 'lead').confident,
        project_name: val(r, 'project') || null,
        inquiry_date: rawDate ? (normalizeDate(rawDate) || null) : null,
        date_raw: rawDate || null,            /* original, so the UI can flag a bad one */
        phone: val(r, 'phone') || null,
        email: val(r, 'email') || null,
        notes: val(r, 'notes') || null,
      })
    } else if (sheet.type === 'transactions') {
      const amount = num(r, 'amount')
      if (!amount) return
      const rawDate = val(r, 'date')
      /* Type: an explicit סוג column wins (Hebrew/English synonyms), else a
         negative amount means an expense, else income. */
      const tv = norm(val(r, 'type'))
      const isExpense = ['הוצאה', 'הוצאות', 'חיוב', 'expense', 'debit'].some((w) => tv && tv.includes(norm(w)))
      const isIncome = ['הכנסה', 'זיכוי', 'income', 'credit'].some((w) => tv && tv.includes(norm(w)))
      out.transactions.push({
        _row: `${sheet.id}#${rowIdx}`,
        amount: Math.abs(amount),
        type: isExpense ? 'expense' : isIncome ? 'income' : (amount < 0 ? 'expense' : 'income'),
        date: rawDate ? (normalizeDate(rawDate) || null) : null,
        date_raw: rawDate || null,            /* original value, for "bad date" warnings */
        client_name: val(r, 'client') || null,
        project_name: val(r, 'project') || null,
        desc: val(r, 'notes') || null,
      })
    } else if (sheet.type === 'sessions') {
      const clientName = val(r, 'client')
      if (!clientName) return
      const rawDate = val(r, 'date')
      out.sessions.push({
        _row: `${sheet.id}#${rowIdx}`,
        client_name: clientName,
        date: rawDate ? (normalizeDate(rawDate) || null) : null,
        date_raw: rawDate || null,            /* original value, for "bad date" warnings */
        summary: val(r, 'summary') || val(r, 'notes') || null,
      })
    }
  })
  return out
}
