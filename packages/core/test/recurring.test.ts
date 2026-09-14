/* ════════════════════════════════════════════════════════════════
   RECURRING ENGINE — changing a rule must not rewrite its past.
   ════════════════════════════════════════════════════════════════
   The engine used to walk from a template's EARLIEST row and dedup by exact
   date. Both halves of that turned an ordinary edit into a ledger full of
   pending rows:

     · move a monthly rule from the 1st to the 15th, and every past 15th
       read as empty — one pending row per month since the rule began;
     · switch it to weekly, and the same for every week;
     · edit one occurrence's date (paid on the 3rd), and the 1st came back
       as a second row for the same month — income counted twice.

   These pin the fix — walk from the NEWEST row, one row per period — and,
   just as much, what must keep working: a coach away for months still gets
   every occurrence they missed.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { generateRecurringTransactions } from '../src/domain/recurring'

const monthly = (patch: Record<string, unknown> = {}) => ({
  id: 't1', active: true, trigger_type: 'schedule', cadence_type: 'monthly_date',
  day_of_month: 1, amount: 500, type: 'expense', created_at: '2026-01-01T00:00:00', ...patch,
})
const row = (date: string) => ({ recurring_id: 't1', date, scheduled_meeting_id: null })
const firstOfMonths = (...months: number[]) => months.map((m) => row(`2026-${String(m).padStart(2, '0')}-01`))
const dates = (out: Array<{ date: string }>) => out.map((p) => p.date)

describe('changing a rule', () => {
  it('moving the day does not refill the months already paid', () => {
    const rows = firstOfMonths(3, 4, 5, 6, 7)
    const tmpl = monthly({ day_of_month: 15 })
    expect(generateRecurringTransactions([tmpl], rows, new Date('2026-07-20T12:00:00'))).toEqual([])
    /* …and the next month is owed on the new day. */
    expect(dates(generateRecurringTransactions([tmpl], rows, new Date('2026-08-20T12:00:00')))).toEqual(['2026-08-15'])
  })

  it('switching monthly to weekly starts after the last payment, not at the first', () => {
    const rows = firstOfMonths(3, 4, 5, 6, 7) // 2026-07-01 is a Wednesday
    const weekly = monthly({ cadence_type: 'weekly', day_of_month: null, day_of_week: 2 })
    expect(dates(generateRecurringTransactions([weekly], rows, new Date('2026-07-20T12:00:00'))))
      .toEqual(['2026-07-07', '2026-07-14'])
  })
})

describe('editing an occurrence', () => {
  it('a monthly row moved within its month keeps the month', () => {
    const rows = [row('2026-06-01'), row('2026-07-03')]
    expect(generateRecurringTransactions([monthly()], rows, new Date('2026-07-20T12:00:00'))).toEqual([])
  })

  it('a weekly row moved within its week keeps the week', () => {
    const weekly = monthly({ cadence_type: 'weekly', day_of_month: null, day_of_week: 2 })
    const rows = [row('2026-06-30'), row('2026-07-09')] // Tue, then a Tue moved to Thu
    expect(dates(generateRecurringTransactions([weekly], rows, new Date('2026-07-20T12:00:00')))).toEqual(['2026-07-14'])
  })
})

describe('what must keep working', () => {
  it('a coach away for months gets every occurrence since the last one', () => {
    expect(dates(generateRecurringTransactions([monthly()], firstOfMonths(3), new Date('2026-07-20T12:00:00'))))
      .toEqual(['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01'])
  })

  it('a rule with no rows starts from its creation', () => {
    const tmpl = monthly({ day_of_month: 10, created_at: '2026-06-01T00:00:00' })
    expect(dates(generateRecurringTransactions([tmpl], [], new Date('2026-07-15T18:00:00')))).toEqual(['2026-06-10', '2026-07-10'])
  })

  it('the until date is inclusive, read as a local day', () => {
    const tmpl = monthly({ day_of_month: 10, created_at: '2026-06-01T00:00:00', until_date: '2026-07-10' })
    expect(dates(generateRecurringTransactions([tmpl], [], new Date('2026-08-20T12:00:00')))).toEqual(['2026-06-10', '2026-07-10'])
  })

  it('the newest row deleted frees its slot again — which is why deleting pauses the rule', () => {
    /* listTransactions filters deleted_at, so a deleted July row is simply
       absent. apps/web/src/lib/recurringTx.js owns the rest of this story. */
    expect(dates(generateRecurringTransactions([monthly()], firstOfMonths(6), new Date('2026-07-20T12:00:00')))).toEqual(['2026-07-01'])
  })
})
