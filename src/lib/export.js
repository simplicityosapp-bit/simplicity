/* ════════════════════════════════════════════════════════════════
   EXPORT — CSV generation + browser-triggered download.
   ════════════════════════════════════════════════════════════════
   UTF-8 BOM is prepended so Excel on Windows opens the file in the
   right encoding (Hebrew survives the round-trip). Each cell is
   wrapped in double quotes and any embedded quotes are escaped per
   RFC 4180.
   ════════════════════════════════════════════════════════════════ */

const TYPE_HE = { income: 'הכנסה', expense: 'הוצאה' }
const STATUS_HE = { confirmed: 'אושרה', pending: 'ממתינה', skipped: 'דולגה' }

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

/* Build the CSV body and trigger a download. The caller passes the
   month so the filename reads, e.g., "mangata-2026-05.csv". */
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
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const yy = monthDate.getFullYear()
  const mm = String(monthDate.getMonth() + 1).padStart(2, '0')
  a.href = url
  a.download = `mangata-${yy}-${mm}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  /* Defer URL revoke so the download has time to start in all browsers. */
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
