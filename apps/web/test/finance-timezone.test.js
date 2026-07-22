/* ════════════════════════════════════════════════════════════════
   FINANCE BUCKETING — a transaction's `date` is a calendar day.
   ════════════════════════════════════════════════════════════════
   Companion to dates-timezone.test.js, and pinned to America/New_York for
   the same reason: transactions.date is a DATE column, so Supabase returns
   'YYYY-MM-DD'. `new Date()` reads that as UTC midnight while the month/day
   getters (and financeQuery's local from/to bounds) read local — so west of
   UTC the 1st of the month falls into the PREVIOUS month, the chart plots it
   on the wrong day, and the recurring dedup key misses.

   In Asia/Jerusalem every assertion here passes against the buggy code,
   which is exactly why the suite pins a negative offset.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import { financeQuery, financeDailyBuckets, toDateKey, toLocalDate } from '@simplicity/core'

const tx = (date, amount, type = 'income') => ({ id: date + type, date, amount, type, status: 'confirmed' })

/* Inclusive local bounds for August 2026 — what currentMonthRange builds. */
const AUG_FROM = new Date(2026, 7, 1, 0, 0, 0, 0)
const AUG_TO = new Date(2026, 7, 31, 23, 59, 59, 999)

describe('toLocalDate keeps a date-only string on its own calendar day', () => {
  it('does not roll the 1st back into the previous month', () => {
    const d = toLocalDate('2026-08-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August
    expect(d.getDate()).toBe(1)
  })

  it('still treats a real instant as an instant', () => {
    /* 02:00Z on the 1st is 22:00 on July 31st in New York — this one SHOULD
       move. It is a moment, not a calendar day. */
    expect(toLocalDate('2026-08-01T02:00:00Z').getMonth()).toBe(6)
  })
})

describe('financeQuery keeps the edges of the month in range', () => {
  it('includes the 1st', () => {
    const rows = financeQuery({ source: [tx('2026-08-01', 100)], from: AUG_FROM, to: AUG_TO })
    expect(rows).toHaveLength(1)
  })

  it('includes the last day', () => {
    const rows = financeQuery({ source: [tx('2026-08-31', 100)], from: AUG_FROM, to: AUG_TO })
    expect(rows).toHaveLength(1)
  })

  it('still excludes the neighbouring months', () => {
    const rows = financeQuery({
      source: [tx('2026-07-31', 100), tx('2026-09-01', 100)],
      from: AUG_FROM,
      to: AUG_TO,
    })
    expect(rows).toHaveLength(0)
  })

  it('sums a full month without losing the first day', () => {
    const source = [tx('2026-08-01', 400), tx('2026-08-15', 300), tx('2026-08-31', 300)]
    const total = financeQuery({ source, from: AUG_FROM, to: AUG_TO }).reduce((s, r) => s + r.amount, 0)
    expect(total).toBe(1000)
  })
})

describe('financeDailyBuckets plots each transaction on its own day', () => {
  it('puts the 1st in the first bucket, not the last', () => {
    const { dailyInc, cumInc } = financeDailyBuckets(2026, 7, { source: [tx('2026-08-01', 500)] })
    expect(dailyInc[0]).toBe(500)
    expect(cumInc[0]).toBe(500) // the line starts at 500, not at 0
  })

  it('puts the last day in the last bucket', () => {
    const { daysInMonth, dailyInc } = financeDailyBuckets(2026, 7, { source: [tx('2026-08-31', 500)] })
    expect(daysInMonth).toBe(31)
    expect(dailyInc[30]).toBe(500)
  })

  it('does not drop income out of the month total', () => {
    const source = [tx('2026-08-01', 200), tx('2026-08-31', 300)]
    const { cumInc } = financeDailyBuckets(2026, 7, { source })
    expect(cumInc[cumInc.length - 1]).toBe(500)
  })
})

describe('toDateKey round-trips the stored date', () => {
  it('a date-only string keeps its own day', () => {
    expect(toDateKey('2026-08-01')).toBe('2026-08-01')
  })

  it('an existing row and its due Date produce the SAME key', () => {
    /* This is the dedup that stops the recurring engine regenerating a
       pending transaction it already created: the existing row carries the
       stored string, the due date is a local Date. */
    expect(toDateKey('2026-08-01')).toBe(toDateKey(new Date(2026, 7, 1)))
  })
})
