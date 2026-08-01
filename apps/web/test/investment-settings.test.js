/* ════════════════════════════════════════════════════════════════
   INVESTMENT PERCENTAGE — settings shape + the amount arithmetic.
   ════════════════════════════════════════════════════════════════
   Pinned to America/New_York for the same reason finance-timezone.test.js
   is: transactions.date is a DATE column ('YYYY-MM-DD'), and the range
   bounds are LOCAL midnights. West of UTC a naive `new Date()` files the
   1st of the month under the previous month — which here would silently
   move a transaction in or out of "last month" and change the figure the
   user is asked to invest. In Asia/Jerusalem that bug is invisible.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import { previousMonthRange } from '@simplicity/core'
import {
  computeInvestment,
  migrateInvestmentSettings,
  normalizePercent,
} from '../src/hooks/useInvestmentSettings'

const tx = (date, amount, type = 'income', extra = {}) => ({
  id: date + type + amount, date, amount, type, status: 'confirmed', ...extra,
})

/* "Today" for every test below — 5 Aug 2026, so last month is July 2026. */
const NOW = new Date(2026, 7, 5, 12, 0, 0)

describe('previousMonthRange', () => {
  it('spans the whole previous calendar month', () => {
    const { from, to } = previousMonthRange(NOW)
    expect(from.getFullYear()).toBe(2026)
    expect(from.getMonth()).toBe(6) // July
    expect(from.getDate()).toBe(1)
    expect(to.getMonth()).toBe(6)
    expect(to.getDate()).toBe(31) // July has 31 days
  })

  it('rolls the year back in January', () => {
    const { from, to } = previousMonthRange(new Date(2026, 0, 9))
    expect(from.getFullYear()).toBe(2025)
    expect(from.getMonth()).toBe(11) // December
    expect(to.getFullYear()).toBe(2025)
    expect(to.getDate()).toBe(31)
  })

  it('lands on the short month correctly', () => {
    /* March → February. 2026 is not a leap year. */
    expect(previousMonthRange(new Date(2026, 2, 15)).to.getDate()).toBe(28)
  })
})

describe('normalizePercent', () => {
  it('clamps to 0–100', () => {
    expect(normalizePercent(-5)).toBe(0)
    expect(normalizePercent(140)).toBe(100)
  })

  it('never yields NaN from an empty or junk input', () => {
    expect(normalizePercent('')).toBe(10)
    expect(normalizePercent(undefined)).toBe(10)
    expect(normalizePercent('abc')).toBe(10)
  })

  it('accepts a typed string and keeps two decimals', () => {
    expect(normalizePercent('12.5')).toBe(12.5)
    expect(normalizePercent(7.129)).toBe(7.13)
  })
})

describe('migrateInvestmentSettings', () => {
  it('defaults to monthly income at 10%', () => {
    expect(migrateInvestmentSettings(null)).toEqual({ base: 'income', percent: 10, view: 'monthly' })
  })

  it('rejects unknown base/view values rather than storing them', () => {
    const out = migrateInvestmentSettings({ base: 'revenue', view: 'weekly', percent: 20 })
    expect(out.base).toBe('income')
    expect(out.view).toBe('monthly')
    expect(out.percent).toBe(20) // the valid field survives
  })

  it('is idempotent', () => {
    const once = migrateInvestmentSettings({ base: 'net', percent: 15, view: 'cumulative' })
    expect(migrateInvestmentSettings(once)).toEqual(once)
  })
})

describe('computeInvestment — the target (previous calendar month)', () => {
  const rows = [
    tx('2026-07-01', 4000),              // first day of last month — the edge
    tx('2026-07-31', 6000),              // last day of last month — the other edge
    tx('2026-07-15', 2000, 'expense'),
    tx('2026-08-03', 9000),              // this month — must NOT count
    tx('2026-06-30', 5000),              // month before last — must NOT count
  ]

  it('counts both edges of the month and nothing outside it', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW)
    expect(r.income).toBe(10000)
    expect(r.expenses).toBe(2000)
    expect(r.net).toBe(8000)
  })

  it('takes the percentage of income when base is income', () => {
    expect(computeInvestment(rows, { base: 'income', percent: 10 }, NOW).targetAmount).toBe(1000)
  })

  it('takes the percentage of net when base is net', () => {
    const r = computeInvestment(rows, { base: 'net', percent: 10 }, NOW)
    expect(r.baseAmount).toBe(8000)
    expect(r.targetAmount).toBe(800)
  })

  it('is identical in both views — the toggle must not move the target', () => {
    const monthly = computeInvestment(rows, { base: 'income', percent: 10, view: 'monthly' }, NOW)
    const cumulative = computeInvestment(rows, { base: 'income', percent: 10, view: 'cumulative' }, NOW)
    expect(monthly.targetAmount).toBe(1000)
    expect(cumulative.targetAmount).toBe(1000)
  })
})

describe('computeInvestment — which transactions count', () => {
  it('ignores pending, skipped, deleted and credit-noted rows', () => {
    const rows = [
      tx('2026-07-10', 1000),
      tx('2026-07-11', 500, 'income', { status: 'pending' }),
      tx('2026-07-12', 500, 'income', { status: 'skipped' }),
      tx('2026-07-13', 500, 'income', { deleted_at: '2026-07-20T00:00:00Z' }),
      tx('2026-07-14', 500, 'income', { invoice_credited_at: '2026-07-21T00:00:00Z' }),
    ]
    /* Only the first row is real money — the same rule the finance screen's
       own header applies. */
    expect(computeInvestment(rows, { base: 'income', percent: 50 }, NOW).income).toBe(1000)
  })
})

describe('computeInvestment — a losing month', () => {
  const rows = [tx('2026-07-05', 1000), tx('2026-07-06', 3000, 'expense')]

  it('floors the target at zero and flags why', () => {
    const r = computeInvestment(rows, { base: 'net', percent: 20 }, NOW)
    expect(r.net).toBe(-2000)
    expect(r.baseAmount).toBe(-2000)
    expect(r.targetAmount).toBe(0)
    expect(r.baseWasNegative).toBe(true)
  })

  it('still pays out on the income base — income itself is not negative', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 20 }, NOW)
    expect(r.targetAmount).toBe(200)
    expect(r.baseWasNegative).toBe(false)
  })
})

describe('computeInvestment — the invested record', () => {
  /* This is a RECORD, not a prescription: only amounts the user explicitly
     confirmed. It must never be derived from income — a big income history
     is not an investment. NOW is 5 Aug 2026, so "this month" is August. */
  const rows = [tx('2026-07-15', 3000), tx('2026-08-03', 999000)]
  const invested = [
    { amount: 250, invested_on: '2026-08-01' }, // this month — the edge
    { amount: 400, invested_on: '2026-08-04' }, // this month
    { amount: 100, invested_on: '2026-07-20' }, // last month — total only
    { amount: 900, invested_on: '2025-11-02' }, // long ago — total only
  ]

  it('monthly sums only the current month, including its 1st', () => {
    const r = computeInvestment(rows, { view: 'monthly' }, NOW, invested)
    expect(r.investedThisMonth).toBe(650)
    expect(r.investedAmount).toBe(650)
  })

  it('cumulative sums everything ever recorded', () => {
    const r = computeInvestment(rows, { view: 'cumulative' }, NOW, invested)
    expect(r.investedTotal).toBe(1650)
    expect(r.investedAmount).toBe(1650)
  })

  it('never derives the record from income', () => {
    /* ₪999,000 of income sits in the source rows above; if the record ever
       leaked from the transactions it would show up here. */
    const r = computeInvestment(rows, { view: 'cumulative' }, NOW, [])
    expect(r.investedAmount).toBe(0)
  })

  it('exposes the target alongside the record, in both views', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 10, view: 'cumulative' }, NOW, invested)
    expect(r.targetAmount).toBe(300) // 10% of July's ₪3,000
    expect(r.investedAmount).toBe(1650)
  })

  it('distinguishes "no history wired up yet" from "invested ₪0"', () => {
    const missing = computeInvestment(rows, {}, NOW, null)
    expect(missing.investedAmount).toBe(0)
    expect(missing.investmentsKnown).toBe(false)

    const genuinelyNone = computeInvestment(rows, {}, NOW, [])
    expect(genuinelyNone.investedAmount).toBe(0)
    expect(genuinelyNone.investmentsKnown).toBe(true)
  })

  it('survives malformed history rows without going NaN', () => {
    const messy = [{ amount: 100, invested_on: '2026-08-02' }, {}, { amount: null, invested_on: '2026-08-02' }, { amount: 50 }]
    const r = computeInvestment(rows, { view: 'monthly' }, NOW, messy)
    expect(r.investedThisMonth).toBe(100) // the dateless row can't be placed in a month
    expect(r.investedTotal).toBe(150)     // but it still counts toward all time
  })
})

describe('computeInvestment — the target must not eat itself', () => {
  /* Recording an investment creates an expense. If that expense counted
     toward the base, every month's target would shrink the next one's, and
     the figure would spiral downward until it hit zero. The link between an
     investment and its transaction is what stops that. */
  const invested = [{ amount: 800, invested_on: '2026-07-10', transaction_id: 'tx-inv' }]
  const rows = [
    tx('2026-07-01', 10000),
    { id: 'tx-inv', date: '2026-07-10', amount: 800, type: 'expense', status: 'confirmed' },
    tx('2026-07-12', 1000, 'expense'), // an ordinary expense — must still count
  ]

  it('excludes the investment expense from net, but keeps ordinary ones', () => {
    const r = computeInvestment(rows, { base: 'net', percent: 10 }, NOW, invested)
    expect(r.expenses).toBe(1000)     // the ₪800 investment is out, the ₪1,000 is in
    expect(r.net).toBe(9000)
    expect(r.targetAmount).toBe(900)
  })

  it('is stable month over month — the same income yields the same target', () => {
    /* Without the exclusion this would drop to ₪820 (10% of 10,000−800−1,000). */
    const withoutHistory = computeInvestment(rows, { base: 'net', percent: 10 }, NOW, [])
    expect(withoutHistory.targetAmount).toBe(820) // proves the guard is what's acting
    const withHistory = computeInvestment(rows, { base: 'net', percent: 10 }, NOW, invested)
    expect(withHistory.targetAmount).toBe(900)
  })

  it('leaves the income base untouched — an expense was never in it', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, invested)
    expect(r.income).toBe(10000)
    expect(r.targetAmount).toBe(1000)
  })
})

describe('computeInvestment — the basis month has closed', () => {
  /* The target always comes from last month. When THIS month has taken nothing
     in yet, a figure sitting above a ₪0 month reads as a bug unless the row
     says where it came from. NOW is 5 Aug 2026 → basis July, current August. */
  it('flags a target drawn from last month while this one is still empty', () => {
    const r = computeInvestment([tx('2026-07-10', 5000)], { base: 'income', percent: 10 }, NOW)
    expect(r.targetAmount).toBe(500)
    expect(r.currentMonthIncome).toBe(0)
    expect(r.basisIsStale).toBe(true)
  })

  it('drops the flag as soon as this month has income', () => {
    const rows = [tx('2026-07-10', 5000), tx('2026-08-02', 120)]
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW)
    expect(r.currentMonthIncome).toBe(120)
    expect(r.basisIsStale).toBe(false)
  })

  it('does not flag when there is no target to explain', () => {
    /* Nothing last month either — that is the "no data" state, which has its
       own wording; two notes saying different things would just be noise. */
    const r = computeInvestment([], { base: 'income', percent: 10 }, NOW)
    expect(r.targetAmount).toBe(0)
    expect(r.basisIsStale).toBe(false)
  })

  it('counts only income toward the current month, not expenses', () => {
    const rows = [tx('2026-07-10', 5000), tx('2026-08-02', 900, 'expense')]
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW)
    expect(r.currentMonthIncome).toBe(0)
    expect(r.basisIsStale).toBe(true)
  })
})

describe('computeInvestment — nothing to report', () => {
  it('separates "no data" from a real zero', () => {
    const empty = computeInvestment([], { base: 'income', percent: 10 }, NOW)
    expect(empty.targetAmount).toBe(0)
    expect(empty.hasData).toBe(false)

    const quiet = computeInvestment([tx('2026-07-02', 0)], { base: 'income', percent: 10 }, NOW)
    expect(quiet.hasData).toBe(false) // a ₪0 row is still nothing to invest

    const real = computeInvestment([tx('2026-07-02', 100)], { base: 'income', percent: 0 }, NOW)
    expect(real.targetAmount).toBe(0) // 0% of real income
    expect(real.hasData).toBe(true)
  })

  it('survives a null transactions list (still loading)', () => {
    expect(computeInvestment(null, { base: 'income', percent: 10 }, NOW).targetAmount).toBe(0)
  })
})
