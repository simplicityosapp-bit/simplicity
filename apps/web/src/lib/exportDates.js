/* ════════════════════════════════════════════════════════════════
   EXPORT DATE FORMATTING — pure, no i18n, no DOM.
   ════════════════════════════════════════════════════════════════
   Split out of export.js so it can be tested. export.js registers i18n
   resource bundles at module scope, so importing it from a test drags the
   whole i18n runtime in; this module imports nothing but a date helper.
   Same reasoning as netChartGeometry.js — the arithmetic is the part worth
   pinning, and it cannot be pinned through a module with side effects.
   ════════════════════════════════════════════════════════════════ */

import { toLocalDate } from '@simplicity/core'

/* dd/mm/yyyy for a spreadsheet cell.

   toLocalDate, NOT `new Date` — most of what reaches here is a DATE column
   ('YYYY-MM-DD': transactions.date, leads.inquiry_date, goals.target_date,
   goal_entries.date, daily_answers.date, moon_snapshots.date, installment
   due dates). `new Date('2026-08-01')` parses that as UTC midnight while the
   getters below read LOCAL, so anywhere west of Greenwich every one of those
   exported dates came out a day early — 01/08 written as 31/07, and a 1
   January row landing in the previous tax year. toLocalDate keeps a date-only
   string on its own calendar day and still treats a real timestamptz
   (sessions.date) as the instant it is. */
export function fmtDate(d) {
  if (!d) return ''
  const x = toLocalDate(d)
  const dd = String(x.getDate()).padStart(2, '0')
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${x.getFullYear()}`
}
