/* ════════════════════════════════════════════════════════════════
   EXPORT — CSV generation + browser-triggered download.
   ════════════════════════════════════════════════════════════════
   UTF-8 BOM is prepended so Excel on Windows opens the file in the
   right encoding (Hebrew survives the round-trip). Each cell is
   wrapped in double quotes and any embedded quotes are escaped per
   RFC 4180.
   The clients/projects exports use header names the CSV importer
   recognises (שם / טלפון / פרויקט / סטטוס / מספר פגישות / מחיר לפגישה /
   הערות / צבע), so an export can be re-imported cleanly (round-trip).
   ════════════════════════════════════════════════════════════════ */

const TYPE_HE = { income: 'הכנסה', expense: 'הוצאה' }
const STATUS_HE = { confirmed: 'אושרה', pending: 'ממתינה', skipped: 'דולגה' }
/* status_meta → Hebrew the importer's STATUS_MAP can read back. */
const STATUS_META_HE = { active: 'פעיל', wandering: 'ביניים', past: 'לשעבר', no_status: 'ללא סטטוס' }

function esc(v) {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function fmtAmount(n) {
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

function fmtDate(d) {
  if (!d) return ''
  const x = new Date(d)
  const dd = String(x.getDate()).padStart(2, '0')
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${x.getFullYear()}`
}

function nameById(arr, id) {
  if (!id) return ''
  const row = (arr || []).find((r) => r.id === id)
  return row?.name || ''
}

function ymd(date) {
  const d = date || new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/* Build a CSV string (BOM + quoted cells) from a header row + data rows,
   then trigger a download under `filename`. */
function downloadCsv(headers, rows, filename) {
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  /* Defer revoke so the download has time to start in all browsers. */
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* Transactions — caller passes the month so the filename reads, e.g.,
   "mangata-2026-05.csv". */
export function exportTransactionsCSV({ transactions, clients, projects, categories, monthDate }) {
  const headers = ['תאריך', 'סוג', 'סכום', 'תיאור', 'סטטוס', 'לקוח', 'פרויקט', 'קטגוריה']
  const rows = (transactions || []).map((t) => [
    fmtDate(t.date),
    TYPE_HE[t.type] || t.type || '',
    fmtAmount(Number(t.amount || 0)),
    t.desc || '',
    STATUS_HE[t.status] || t.status || '',
    nameById(clients, t.client_id),
    nameById(projects, t.project_id),
    nameById(categories, t.category_id),
  ])
  const yy = monthDate.getFullYear()
  const mm = String(monthDate.getMonth() + 1).padStart(2, '0')
  downloadCsv(headers, rows, `mangata-${yy}-${mm}.csv`)
}

/* Clients — round-trip-friendly columns (re-importable). */
export function exportClientsCSV({ clients, projects, now }) {
  const headers = ['שם', 'טלפון', 'פרויקט', 'סטטוס', 'מספר פגישות', 'מחיר לפגישה', 'הערות']
  const rows = (clients || [])
    .filter((c) => !c.deleted_at)
    .map((c) => [
      c.name || '',
      c.phone || '',
      nameById(projects, c.project_id),
      STATUS_META_HE[c.status_meta] || '',
      c.sessions != null ? String(c.sessions) : '',
      fmtAmount(Number(c.price_per_session || 0)),
      c.notes || '',
    ])
  downloadCsv(headers, rows, `mangata-clients-${ymd(now)}.csv`)
}

/* Projects — name + colour (re-importable; colour is ignored on import). */
export function exportProjectsCSV({ projects, now }) {
  const headers = ['שם', 'צבע']
  const rows = (projects || [])
    .filter((p) => !p.deleted_at)
    .map((p) => [p.name || '', p.color || ''])
  downloadCsv(headers, rows, `mangata-projects-${ymd(now)}.csv`)
}
