/* ════════════════════════════════════════════════════════════════
   DATE FORMATTERS — a bare 'YYYY-MM-DD' is a calendar day, not an instant.
   ════════════════════════════════════════════════════════════════
   Pinned to America/New_York (UTC-4/-5) ON PURPOSE. In Israel this bug is
   invisible: `new Date('2026-07-20')` is UTC midnight, which is 02:00/03:00
   the SAME local day, so the local getters happen to read back the right
   date. West of UTC it is 19:00/20:00 the PREVIOUS day, and every date-only
   value renders one day early — birth dates, transaction dates, an
   adjustment's occurred_on.

   These tests would pass against the buggy implementation if they ran in
   Asia/Jerusalem, which is exactly why they don't.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import { fmtShortDate, fmtDateInput, fmtMonthYear, setDateTimeFormat } from '@simplicity/core'

describe('date-only strings keep their calendar day west of UTC', () => {
  it('fmtShortDate does not roll back a day', () => {
    expect(fmtShortDate('2026-07-20')).toBe('20/07')
  })

  it('fmtDateInput does not roll back a day', () => {
    expect(fmtDateInput('2026-07-20')).toBe('20/07/26')
  })

  it('holds across a month boundary — the case that also shifts the month', () => {
    expect(fmtShortDate('2026-08-01')).toBe('01/08')
    expect(fmtDateInput('2026-08-01')).toBe('01/08/26')
  })

  it('holds across a year boundary', () => {
    expect(fmtShortDate('2027-01-01')).toBe('01/01')
    expect(fmtDateInput('2027-01-01')).toBe('01/01/27')
  })

  it('fmtMonthYear reports the month the date actually belongs to', () => {
    expect(fmtMonthYear('2026-08-01')).toMatch(/August|אוגוסט/)
  })
})

describe('timestamps are left exactly as they were', () => {
  it('an instant with a zone still converts to local time', () => {
    /* 2026-07-20T02:00:00Z is 22:00 on the 19th in New York. This one SHOULD
       move — it is a real moment, not a calendar day, and treating it as
       local would be the actual bug. */
    expect(fmtShortDate('2026-07-20T02:00:00Z')).toBe('19/07')
  })

  it('a Date object is passed through untouched', () => {
    expect(fmtShortDate(new Date(2026, 6, 20))).toBe('20/07')
  })
})

describe('the user date_format preference still drives the output', () => {
  it('honours MM/DD/YY and YYYY-MM-DD for date-only input', () => {
    setDateTimeFormat({ date_format: 'MM/DD/YY' })
    expect(fmtShortDate('2026-07-20')).toBe('07/20')
    expect(fmtDateInput('2026-07-20')).toBe('07/20/26')

    setDateTimeFormat({ date_format: 'YYYY-MM-DD' })
    expect(fmtShortDate('2026-07-20')).toBe('07-20')
    expect(fmtDateInput('2026-07-20')).toBe('2026-07-20')

    setDateTimeFormat({ date_format: 'DD/MM/YY' })
  })
})

describe('malformed input still degrades the way it used to', () => {
  it('fmtDateInput returns empty for an unparseable value', () => {
    expect(fmtDateInput('not-a-date')).toBe('')
    expect(fmtDateInput(null)).toBe('')
    expect(fmtDateInput('')).toBe('')
  })
})
