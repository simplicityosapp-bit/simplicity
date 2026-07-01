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
import { detectColumnType, parseAmount, findHeaderRow } from './columnDetect'
import { normalizeDate } from './csvImport'
import { mapValueToMetaConfident } from './statusImport'
import { parsePayMethod } from './invoiceDocs'

/* Re-exported from columnDetect (its canonical home) so existing importers
   of sheetMapper.findHeaderRow keep working. */
export { findHeaderRow }

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/["'`״׳]/g, '').replace(/[\s\-_.]+/g, '')

/* Map a content-detected column type → the entity field it implies, per
   entity. e.g. a 'phone' column → the entity's `phone` field. Returns
   null when the entity has no field for that type. */
const CONTENT_TYPE_FIELD = {
  clients:      { phone: 'phone', email: 'email', status: 'status', date: 'payment_date',  amount: 'income', name: 'name' },
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
  transactions: 'הכנסות והוצאות',
  sessions: 'יומן פגישות',
  matrix: 'טבלת הכנסות/הוצאות לפי חודשים',
  ignore: 'לא לייבא',
}

/* One-line, plain-language explanation per sheet type — shown under the
   "what's in this table?" picker so a first-timer who has never seen the
   app knows what each choice means (esp. the matrix layout). */
export const SHEET_TYPE_HELP = {
  clients: 'רשימת לקוחות — שם, טלפון, סטטוס, פגישות וכו׳.',
  projects: 'רשימת פרויקטים / תוכניות / מסלולים.',
  leads: 'פניות ומתעניינים שעוד לא הפכו ללקוחות.',
  transactions: 'שורה לכל תשלום או הוצאה, עם תאריך וסכום.',
  sessions: 'יומן פגישות שכבר התקיימו — שורה לכל מפגש.',
  matrix: 'טבלה שבה החודשים הם עמודות, וכל שורה היא סעיף הכנסה או הוצאה.',
  ignore: 'הטבלה הזו לא תיובא.',
}

/* Sheet-name → entity hints. */
const SHEET_NAME_HINTS = {
  clients:      ['לקוח', 'לקוחות', 'client', 'clients', 'customer', 'מטופל', 'מטופלים', 'חניך', 'חניכים', 'תלמיד', 'תלמידים', 'משתתפים', 'כרטיסי', 'רשימתלקוחות', 'roster'],
  projects:     ['פרויקט', 'פרוייקט', 'פרויקטים', 'project', 'projects', 'program', 'שירותים', 'חבילות', 'תוכניות', 'מסלולים'],
  leads:        ['ליד', 'לידים', 'lead', 'leads', 'פניות', 'פנייה', 'מתעניינים', 'פוטנציאל', 'פוטנציאליים', 'prospects'],
  transactions: ['תשלום', 'תשלומים', 'הכנס', 'הוצא', 'תנוע', 'payment', 'transaction', 'income', 'expense', 'finance', 'כספים', 'קופה', 'תזרים', 'חשבונות', 'מאזן', 'רווחוהפסד', 'cashflow'],
  sessions:     ['יומןפגישות', 'יומןמפגשים', 'פגישותשהתקיימו', 'מפגשים', 'מעקבפגישות', 'יומן', 'meetings', 'sessions', 'sessionlog'],
  ignore:       ['סיכום', 'summary', 'דאשבורד', 'dashboard', 'הוראות', 'readme', 'info', 'הסבר', 'גרפים', 'charts'],
}

/* Per-entity column-field catalogs. Each field: key + Hebrew label +
   header synonyms. The UI offers these in the column dropdown; auto-map
   matches a header to the first field whose synonym equals it. */
export const ENTITY_FIELDS = {
  clients: [
    { key: 'name',      label: 'שם הלקוח',        syn: ['שם', 'שםלקוח', 'שםהלקוח', 'שםמלא', 'שםפרטי', 'שםומשפחה', 'שםהעסק', 'name', 'fullname', 'firstname', 'client', 'customer', 'contact', 'מטופל', 'מטופלת', 'חניך', 'חניכה', 'תלמיד', 'תלמידה', 'משתתף', 'משתתפת'] },
    { key: 'status',    label: 'סטטוס',           syn: ['סטטוס', 'סטאטוס', 'status', 'state', 'מצב', 'שלב', 'סטטוסלקוח', 'מצבלקוח'] },
    { key: 'phone',     label: 'טלפון',           syn: ['טלפון', 'טל', 'נייד', 'סלולרי', 'סלולארי', 'פלאפון', 'פלפון', 'מספרטלפון', 'מספרנייד', 'מסטלפון', 'phone', 'mobile', 'tel', 'cell', 'whatsapp', 'וואטסאפ'] },
    { key: 'email',     label: 'אימייל',          syn: ['אימייל', 'מייל', 'דואל', 'דוארל', 'כתובתמייל', 'email', 'mail', 'emailaddress'] },
    { key: 'sessions',  label: 'פגישות שנרכשו',   syn: ['פגישותשנרכשו', 'פגישות', 'מספרפגישות', 'כמותפגישות', 'מפגשים', 'מספרמפגשים', 'סשנים', 'sessions'] },
    { key: 'sessions_done', label: 'פגישות שנעשו', syn: ['פגישותשנעשו', 'פגישותשבוצעו', 'בוצעו', 'מפגשיםשבוצעו'] },
    /* Per-session PRICE — a direct rate column wins over deriving it from
       income÷sessions, so a "מחיר לפגישה" sheet keeps the coach's real rate. */
    { key: 'price_per_session', label: 'מחיר לפגישה', syn: ['מחירלפגישה', 'מחירלמפגש', 'מחירלשעה', 'מחיר', 'תעריף', 'תעריףלשעה', 'עלות', 'עלותלפגישה', 'עלותלמפגש', 'מחירפגישה', 'price', 'rate', 'fee', 'pricepersession'] },
    { key: 'income',    label: 'סך הכנסה',        syn: ['סךהכנסה', 'הכנסה', 'הכנסות', 'income', 'revenue'] },
    { key: 'paid',      label: 'שולם',            syn: ['שולם', 'שולמו', 'שילם', 'paid'] },
    { key: 'total_due', label: 'סה״כ לתשלום',     syn: ['סהכלתשלום', 'סךלתשלום', 'לתשלום', 'סהכמחיר', 'עלותכוללת', 'totaldue', 'totaltopay'] },
    /* Remaining balance — RECOGNISED but intentionally NOT imported: the
       app computes balance itself (total − paid). Mapping a column here
       tells the user "we see this column, and we compute it ourselves". */
    { key: 'computed_balance', label: 'יתרה לתשלום (מחושב אוטומטית)', syn: ['יתרהלתשלום', 'יתרה', 'נותרלתשלום', 'יתרתחוב', 'חוב', 'balance', 'outstanding', 'remaining', 'owed', 'due'] },
    /* Payment method + date — NOT stored on the client; they enrich the income
       transaction derived from `paid` at import (real date + method instead of a
       placeholder). A single "everything" sheet thus yields a dated, methoded
       payment per client, not a hollow lump. */
    { key: 'payment_method', label: 'אמצעי תשלום', syn: ['אמצעיתשלום', 'אמצעי', 'אופןתשלום', 'דרךתשלום', 'paymentmethod', 'payment', 'method'] },
    { key: 'payment_date',   label: 'תאריך תשלום', syn: ['תאריךתשלום', 'מועדתשלום', 'תאריךקבלה', 'תאריך', 'paymentdate', 'datepaid', 'date'] },
    /* Number of installments — when >1 (and there's a total), import builds a
       payment PLAN (פריסת תשלומים) for the client instead of a single payment. */
    { key: 'num_installments', label: 'מספר תשלומים', syn: ['מספרתשלומים', 'מסתשלומים', 'כמותתשלומים', 'מספרתשלום', 'פריסהלתשלומים', 'פריסה', 'installments', 'numpayments', 'numinstallments'] },
    { key: 'project',   label: 'פרויקט',          syn: ['פרויקט', 'פרוייקט', 'תוכנית', 'תכנית', 'מסלול', 'שירות', 'חבילה', 'project', 'program', 'package'] },
    { key: 'notes',     label: 'הערות',           syn: ['הערות', 'הערה', 'תיאור', 'פירוט', 'notes', 'note', 'comment'] },
  ],
  projects: [
    { key: 'name',     label: 'שם הפרויקט',      syn: ['שם', 'שםפרויקט', 'שםהפרויקט', 'תוכנית', 'תכנית', 'מסלול', 'שירות', 'חבילה', 'project', 'name', 'program', 'service'] },
    { key: 'subprojects', label: 'תתי פרויקטים', syn: ['תתיפרויקטים', 'תתפרויקט', 'subprojects'] },
    { key: 'client_count', label: 'מספר לקוחות', syn: ['מספרלקוחות', 'לקוחות', 'clients'] },
    { key: 'notes',    label: 'הערות',           syn: ['הערות', 'notes'] },
  ],
  leads: [
    { key: 'name',     label: 'שם',              syn: ['שם', 'שםליד', 'שםמלא', 'שםפרטי', 'name', 'fullname', 'contact', 'מתעניין', 'מתעניינת'] },
    { key: 'status',   label: 'סטטוס',           syn: ['סטטוס', 'סטאטוס', 'status', 'שלב', 'stage', 'state'] },
    { key: 'category', label: 'קטגוריה',         syn: ['קטגוריה', 'category', 'סיווג'] },
    { key: 'source',   label: 'מקור',            syn: ['מקור', 'source', 'ערוץ', 'channel', 'מאיפההגיע', 'איךהגיע', 'היכרות'] },
    { key: 'project',  label: 'פרויקט',          syn: ['פרויקט', 'פרוייקט', 'תוכנית', 'מתענייןב', 'project'] },
    { key: 'date',     label: 'תאריך',           syn: ['תאריך', 'date', 'תאריךפנייה', 'תאריךפניה', 'מועד', 'inquirydate'] },
    { key: 'phone',    label: 'טלפון',           syn: ['טלפון', 'טל', 'נייד', 'סלולרי', 'פלאפון', 'מספרטלפון', 'phone', 'mobile', 'whatsapp', 'וואטסאפ'] },
    { key: 'email',    label: 'אימייל',          syn: ['אימייל', 'מייל', 'דואל', 'כתובתמייל', 'email', 'mail'] },
    { key: 'notes',    label: 'הערות',           syn: ['הערות', 'הערה', 'תיאור', 'פירוט', 'notes'] },
  ],
  transactions: [
    { key: 'client',   label: 'שם לקוח',         syn: ['שםלקוח', 'לקוח', 'client', 'name', 'מטופל', 'חניך', 'משולם ע״י', 'משולםעי'] },
    { key: 'amount',   label: 'סכום',            syn: ['סכום', 'amount', 'סךהכנסה', 'הכנסה', 'הכנסות', 'תקבול', 'income', 'sum', 'total', 'סכוםתשלום'] },
    { key: 'paid',     label: 'שולם',            syn: ['שולם', 'שולמו', 'paid'] },
    { key: 'balance',  label: 'יתרה',            syn: ['יתרה', 'יתרהלתשלום', 'חוב', 'balance'] },
    { key: 'status',   label: 'סטטוס',           syn: ['סטטוס', 'סטאטוס', 'status', 'סטטוסלקוח'] },
    { key: 'type',     label: 'סוג (הכנסה/הוצאה)', syn: ['סוג', 'type', 'kind', 'סוגתנועה', 'סוגעסקה'] },
    { key: 'category', label: 'קטגוריה',         syn: ['קטגוריה', 'category', 'סעיף', 'סעיףהוצאה', 'סוגהוצאה', 'סיווג', 'tag'] },
    { key: 'payment_method', label: 'אמצעי תשלום', syn: ['אמצעיתשלום', 'אמצעי', 'אופןתשלום', 'דרךתשלום', 'paymentmethod', 'method'] },
    { key: 'date',     label: 'תאריך',           syn: ['תאריך', 'date', 'תאריךתשלום', 'תאריךעסקה', 'מועד'] },
    { key: 'project',  label: 'פרויקט',          syn: ['פרויקט', 'פרוייקט', 'תוכנית', 'project'] },
    { key: 'notes',    label: 'הערות',           syn: ['הערות', 'הערה', 'תיאור', 'פירוט', 'notes'] },
  ],
  /* A HELD-session ledger: one row = one past meeting. client + date are
     the essentials; summary/notes optional. The session NUMBER is assigned
     automatically (continuing from any sessions already logged). */
  sessions: [
    { key: 'client',  label: 'שם לקוח', syn: ['שםלקוח', 'לקוח', 'client', 'name', 'מטופל', 'מטופלת', 'חניך', 'חניכה', 'תלמיד', 'משתתף'] },
    { key: 'date',    label: 'תאריך',   syn: ['תאריך', 'date', 'תאריךפגישה', 'מועד', 'מועדפגישה', 'תאריךמפגש'] },
    { key: 'summary', label: 'סיכום',   syn: ['סיכום', 'summary', 'תקציר', 'סיכוםפגישה', 'מהנעשה'] },
    { key: 'notes',   label: 'הערות',   syn: ['הערות', 'הערה', 'תיאור', 'notes', 'note'] },
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

/* Columns that mark a sheet as carrying money — drives the wizard's "includes
   payments" reassurance (a clients sheet that will ALSO yield income, which is
   exactly the "one sheet with everything" case the import now extracts). */
const PAY_MARK_FIELDS = ['paid', 'income', 'amount', 'total_due', 'payment_method', 'payment_date']

/* Summarise a sheet for the recognition wizard: how many records it yields,
   and whether it carries payment data / a payment-method column. Pure +
   deterministic, mirroring projectSheet's view of the sheet. Type correction
   itself is the dropdown in the wizard — this only drives the badges/nudge. */
export function sheetRecognitionInfo(sheet) {
  if (!sheet || sheet.type === 'matrix') {
    return { yieldCount: (sheet?.pivotTransactions || []).length, hasPayments: true, hasMethod: false, empty: false }
  }
  if (sheet.type === 'ignore') {
    return { yieldCount: 0, hasPayments: false, hasMethod: false, empty: false }
  }
  const p = projectSheet(sheet)
  const yieldCount = p.clients.length + p.projects.length + p.leads.length + p.transactions.length + (p.sessions?.length || 0)
  const mapped = new Set((sheet.mapping || []).filter(Boolean))
  const hasPayments = PAY_MARK_FIELDS.some((f) => mapped.has(f))
  const hasMethod = mapped.has('payment_method')
  return { yieldCount, hasPayments, hasMethod, empty: yieldCount === 0 }
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
      /* A direct "מחיר לפגישה" column wins; otherwise derive the per-session
         price from total income ÷ purchased sessions (the sheet rarely lists
         a rate directly). */
      const priceCol = num(r, 'price_per_session')
      const price = priceCol > 0 ? priceCol : (sessions > 0 && income > 0 ? Math.round(income / sessions) : 0)
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
        /* Enrich the import-derived payment (from `paid`): a recognized method
           column → a PAY_METHODS key (free-text mapped, never raw); a payment
           date → the real transaction date instead of the placeholder. */
        pay_method: parsePayMethod(val(r, 'payment_method')),
        pay_date: (() => { const d = val(r, 'payment_date'); return d ? (normalizeDate(d) || null) : null })(),
        num_installments: Math.floor(num(r, 'num_installments')) || 0,
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
        category: val(r, 'category') || null, /* expense category → category_id on import */
        payment_method: parsePayMethod(val(r, 'payment_method')),
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
