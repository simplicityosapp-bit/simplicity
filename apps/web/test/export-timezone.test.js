/* ════════════════════════════════════════════════════════════════
   EXPORT DATES — a DATE column is a calendar day, not an instant.
   ════════════════════════════════════════════════════════════════
   Pinned to America/New_York for the same reason finance-timezone.test.js
   and dates-timezone.test.js are. Most of what the export formats is a DATE
   column, so Supabase hands back 'YYYY-MM-DD': transactions.date,
   leads.inquiry_date, goals.target_date, goal_entries.date,
   daily_answers.date, moon_snapshots.date, installment due dates.

   `new Date('2026-08-01')` reads that as UTC midnight while getDate() /
   getMonth() read LOCAL — so west of Greenwich every exported date came out
   one day early, and the CSV disagreed with the screen it came from.

   In Asia/Jerusalem (UTC+2/+3) the bug is invisible: UTC midnight is 02:00
   or 03:00 the SAME day. That is exactly why this file pins a negative
   offset — every assertion here passes against the buggy code in Israel,
   which is why it survived this long.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import { fmtDate } from '../src/lib/exportDates'

describe('fmtDate keeps a date-only column on its own calendar day', () => {
  it('writes the 1st as the 1st, not the previous month', () => {
    expect(fmtDate('2026-08-01')).toBe('01/08/2026')
  })

  it('does not shift a mid-month day', () => {
    expect(fmtDate('2026-08-15')).toBe('15/08/2026')
  })

  it('keeps 1 January on the right side of the YEAR boundary', () => {
    /* The worst version: a UTC-midnight read rolls into the previous year, so
       a January row lands in the wrong tax year in an accountant's export. */
    expect(fmtDate('2026-01-01')).toBe('01/01/2026')
  })

  it('handles a leap day without drifting', () => {
    expect(fmtDate('2024-02-29')).toBe('29/02/2024')
  })

  it('still treats a real timestamptz as the instant it is', () => {
    /* sessions.date is timestamptz, not a calendar day. 02:00Z on the 1st IS
       21:00 on the previous day in New York, and that one SHOULD move. */
    expect(fmtDate('2026-08-01T02:00:00Z')).toBe('31/07/2026')
  })

  it('returns empty for a missing date rather than "Invalid Date"', () => {
    expect(fmtDate(null)).toBe('')
    expect(fmtDate('')).toBe('')
    expect(fmtDate(undefined)).toBe('')
  })
})
