/* ════════════════════════════════════════════════════════════════
   INVESTMENT PERCENTAGE — settings shape + the amount arithmetic.
   ════════════════════════════════════════════════════════════════
   Pinned to America/New_York for the same reason finance-timezone.test.js
   is: transactions.date is a DATE column ('YYYY-MM-DD'), and the range
   bounds are LOCAL midnights. West of UTC a naive `new Date()` files the
   1st of the month under the previous month — which here would silently
   move a transaction in or out of the month being computed, change the
   figure the user is asked to invest, and (worse) flip the empty-month
   fallback on or off. In Asia/Jerusalem that bug is invisible.
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

/* "Today" for every test below — 5 Aug 2026, so the month in progress is
   August 2026 and the one before it is July. */
const NOW = new Date(2026, 7, 5, 12, 0, 0)
/* The month the finance screen is parked on. `computeInvestment` takes any
   Date inside it; these name the 1st, the way the screen's own state does. */
const AUG = new Date(2026, 7, 1)
const JUL = new Date(2026, 6, 1)
const JUN = new Date(2026, 5, 1)

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

describe('computeInvestment — the target (the month on screen)', () => {
  const rows = [
    tx('2026-07-01', 4000),              // first day of July — the edge
    tx('2026-07-31', 6000),              // last day of July — the other edge
    tx('2026-07-15', 2000, 'expense'),
    tx('2026-08-03', 9000),              // August — a DIFFERENT month on screen
    tx('2026-06-30', 5000),              // June — ditto
  ]

  it('counts both edges of the selected month and nothing outside it', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, JUL)
    expect(r.income).toBe(10000)
    expect(r.expenses).toBe(2000)
    expect(r.net).toBe(8000)
  })

  it('takes the percentage of income when base is income', () => {
    expect(computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, JUL).targetAmount).toBe(1000)
  })

  it('takes the percentage of net when base is net', () => {
    const r = computeInvestment(rows, { base: 'net', percent: 10 }, NOW, null, JUL)
    expect(r.baseAmount).toBe(8000)
    expect(r.targetAmount).toBe(800)
  })

  it('is identical in both views — the toggle must not move the target', () => {
    const monthly = computeInvestment(rows, { base: 'income', percent: 10, view: 'monthly' }, NOW, null, JUL)
    const cumulative = computeInvestment(rows, { base: 'income', percent: 10, view: 'cumulative' }, NOW, null, JUL)
    expect(monthly.targetAmount).toBe(1000)
    expect(cumulative.targetAmount).toBe(1000)
  })

  /* The whole point of the `month` parameter: navigate the finance screen and
     the widget must move with it, rather than quoting one month while the
     header above it names another. */
  it('follows the month on screen rather than a fixed one', () => {
    expect(computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, AUG).income).toBe(9000)
    expect(computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, JUL).income).toBe(10000)
    expect(computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, JUN).income).toBe(5000)
  })

  it('reports which month it used, and which one is on screen', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, JUL)
    expect(r.basisMonth.getMonth()).toBe(6)    // July — it had income, so no fallback
    expect(r.selectedMonth.getMonth()).toBe(6)
    expect(r.basisFellBack).toBe(false)
  })

  it('defaults to the month in progress when the caller passes none', () => {
    /* The screen always passes one; a caller that doesn't must still get the
       month it is standing in, not an arbitrary one. */
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW)
    expect(r.income).toBe(9000) // August
    expect(r.selectedMonth.getMonth()).toBe(7)
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
    expect(computeInvestment(rows, { base: 'income', percent: 50 }, NOW, null, JUL).income).toBe(1000)
  })

  /* A pending row is not income, so a month holding nothing else must still
     fall back rather than quote a percentage of money that hasn't landed. */
  it('does not let unconfirmed rows hold a month up as "has income"', () => {
    const rows = [
      tx('2026-08-04', 8000, 'income', { status: 'pending' }),
      tx('2026-07-10', 1000),
    ]
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(r.selectedMonthIncome).toBe(0)
    expect(r.basisFellBack).toBe(true)
    expect(r.targetAmount).toBe(100) // 10% of July's confirmed ₪1,000
  })
})

describe('computeInvestment — a losing month', () => {
  const rows = [tx('2026-07-05', 1000), tx('2026-07-06', 3000, 'expense')]

  it('floors the target at zero and flags why', () => {
    const r = computeInvestment(rows, { base: 'net', percent: 20 }, NOW, null, JUL)
    expect(r.net).toBe(-2000)
    expect(r.baseAmount).toBe(-2000)
    expect(r.targetAmount).toBe(0)
    expect(r.baseWasNegative).toBe(true)
  })

  it('still pays out on the income base — income itself is not negative', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 20 }, NOW, null, JUL)
    expect(r.targetAmount).toBe(200)
    expect(r.baseWasNegative).toBe(false)
  })
})

describe('computeInvestment — the invested record', () => {
  /* This is a RECORD, not a prescription: only amounts the user explicitly
     confirmed. It must never be derived from income — a big income history
     is not an investment. The month on screen is August unless stated. */
  const rows = [tx('2026-07-15', 3000), tx('2026-08-03', 999000)]
  const invested = [
    { amount: 250, invested_on: '2026-08-01' }, // August — the edge
    { amount: 400, invested_on: '2026-08-04' }, // August
    { amount: 100, invested_on: '2026-07-20' }, // July — total only
    { amount: 900, invested_on: '2025-11-02' }, // long ago — total only
  ]

  it('monthly sums only the selected month, including its 1st', () => {
    const r = computeInvestment(rows, { view: 'monthly' }, NOW, invested, AUG)
    expect(r.investedInMonth).toBe(650)
    expect(r.investedAmount).toBe(650)
  })

  /* The record follows the SCREEN, not the calendar: navigating to July must
     show what was set aside in July, or the toggle is lying about its label. */
  it('follows the month on screen', () => {
    const r = computeInvestment(rows, { view: 'monthly' }, NOW, invested, JUL)
    expect(r.investedInMonth).toBe(100)
  })

  it('cumulative sums everything ever recorded', () => {
    const r = computeInvestment(rows, { view: 'cumulative' }, NOW, invested, AUG)
    expect(r.investedTotal).toBe(1650)
    expect(r.investedAmount).toBe(1650)
  })

  it('never derives the record from income', () => {
    /* ₪999,000 of income sits in the source rows above; if the record ever
       leaked from the transactions it would show up here. */
    const r = computeInvestment(rows, { view: 'cumulative' }, NOW, [], AUG)
    expect(r.investedAmount).toBe(0)
  })

  it('exposes the target alongside the record, in both views', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 10, view: 'cumulative' }, NOW, invested, JUL)
    expect(r.targetAmount).toBe(300) // 10% of July's ₪3,000
    expect(r.investedAmount).toBe(1650)
  })

  /* The record is NOT netted out of itself the way the target's base is: the
     ₪650 set aside in August must still read as ₪650 while August's own
     income drives the target beside it. */
  it('keeps the record whole while the target excludes its expense', () => {
    const linked = [{ amount: 800, invested_on: '2026-08-04', transaction_id: 'tx-inv' }]
    const src = [
      tx('2026-08-02', 10000),
      { id: 'tx-inv', date: '2026-08-04', amount: 800, type: 'expense', status: 'confirmed' },
    ]
    const r = computeInvestment(src, { base: 'net', percent: 10, view: 'monthly' }, NOW, linked, AUG)
    expect(r.expenses).toBe(0)          // the investment's own expense is out of the base
    expect(r.targetAmount).toBe(1000)   // 10% of ₪10,000, not of ₪9,200
    expect(r.investedInMonth).toBe(800) // but the record still counts it
  })

  it('distinguishes "no history wired up yet" from "invested ₪0"', () => {
    const missing = computeInvestment(rows, {}, NOW, null, AUG)
    expect(missing.investedAmount).toBe(0)
    expect(missing.investmentsKnown).toBe(false)

    const genuinelyNone = computeInvestment(rows, {}, NOW, [], AUG)
    expect(genuinelyNone.investedAmount).toBe(0)
    expect(genuinelyNone.investmentsKnown).toBe(true)
  })

  it('survives malformed history rows without going NaN', () => {
    const messy = [{ amount: 100, invested_on: '2026-08-02' }, {}, { amount: null, invested_on: '2026-08-02' }, { amount: 50 }]
    const r = computeInvestment(rows, { view: 'monthly' }, NOW, messy, AUG)
    expect(r.investedInMonth).toBe(100) // the dateless row can't be placed in a month
    expect(r.investedTotal).toBe(150)   // but it still counts toward all time
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
    const r = computeInvestment(rows, { base: 'net', percent: 10 }, NOW, invested, JUL)
    expect(r.expenses).toBe(1000)     // the ₪800 investment is out, the ₪1,000 is in
    expect(r.net).toBe(9000)
    expect(r.targetAmount).toBe(900)
  })

  it('is stable month over month — the same income yields the same target', () => {
    /* Without the exclusion this would drop to ₪820 (10% of 10,000−800−1,000). */
    const withoutHistory = computeInvestment(rows, { base: 'net', percent: 10 }, NOW, [], JUL)
    expect(withoutHistory.targetAmount).toBe(820) // proves the guard is what's acting
    const withHistory = computeInvestment(rows, { base: 'net', percent: 10 }, NOW, invested, JUL)
    expect(withHistory.targetAmount).toBe(900)
  })

  it('leaves the income base untouched — an expense was never in it', () => {
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, invested, JUL)
    expect(r.income).toBe(10000)
    expect(r.targetAmount).toBe(1000)
  })
})

describe('computeInvestment — the basis falls back one month', () => {
  /* A month that has taken nothing in has no income to take a percentage of.
     Rather than print ₪0 on the 2nd of every month, the basis falls back to
     the month before it — and says so, because a figure sitting above a ₪0
     month reads as a bug unless the row names where it came from. */
  it('falls back when the month on screen has no income yet', () => {
    const r = computeInvestment([tx('2026-07-10', 5000)], { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(r.targetAmount).toBe(500)        // 10% of July
    expect(r.selectedMonthIncome).toBe(0)
    expect(r.basisFellBack).toBe(true)
    expect(r.basisMonth.getMonth()).toBe(6)   // reported as July…
    expect(r.selectedMonth.getMonth()).toBe(7) // …while August is on screen
  })

  it('drops the fallback as soon as the month on screen has income', () => {
    const rows = [tx('2026-07-10', 5000), tx('2026-08-02', 120)]
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(r.selectedMonthIncome).toBe(120)
    expect(r.basisFellBack).toBe(false)
    expect(r.targetAmount).toBe(12) // August's own ₪120, not July's ₪5,000
  })

  /* The rule is uniform, not a special case for the month in progress —
     navigating to an empty April must behave the same as an empty August. */
  it('applies to past months too', () => {
    const rows = [tx('2026-05-10', 4000)]
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, JUN)
    expect(r.basisFellBack).toBe(true)
    expect(r.basisMonth.getMonth()).toBe(4) // May
    expect(r.targetAmount).toBe(400)
  })

  /* ONE step. Walking back until money turns up would quote a figure from an
     arbitrary distance and leave the user no way to locate it. */
  it('never walks back more than one month', () => {
    const rows = [tx('2026-06-10', 9000)] // June has money; July and August don't
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(r.targetAmount).toBe(0)
    expect(r.hasData).toBe(false)
    expect(r.basisFellBack).toBe(false) // "no data" covers this, not the fallback note
  })

  /* With nothing in either month there is no source to name, and captioning a
     ₪0 with "July" points the user at a month that contributed nothing. */
  it('names the month on screen, not the empty fallback, when there is no data', () => {
    const r = computeInvestment([], { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(r.hasData).toBe(false)
    expect(r.basisMonth.getMonth()).toBe(7) // August, the one on screen

    /* But a fallback that actually found money still names its true source. */
    const found = computeInvestment([tx('2026-07-10', 5000)], { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(found.basisMonth.getMonth()).toBe(6) // July
  })

  it('does not flag when there is nothing to explain', () => {
    /* Nothing in either month — the "no data" state, which has its own
       wording; two notes saying different things would just be noise. */
    const r = computeInvestment([], { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(r.targetAmount).toBe(0)
    expect(r.basisFellBack).toBe(false)
  })

  it('counts only income toward the selected month, not expenses', () => {
    const rows = [tx('2026-07-10', 5000), tx('2026-08-02', 900, 'expense')]
    const r = computeInvestment(rows, { base: 'income', percent: 10 }, NOW, null, AUG)
    expect(r.selectedMonthIncome).toBe(0)
    expect(r.basisFellBack).toBe(true)
  })
})

describe('computeInvestment — which month is "this" one', () => {
  /* Drives both the "הושקע החודש" wording and whether pressing השקעתי may
     silently stamp today. Compares months, not days — any date inside August
     is the current month on 5 Aug. */
  it('is true only for the month containing now', () => {
    expect(computeInvestment([], {}, NOW, null, AUG).isCurrentMonth).toBe(true)
    expect(computeInvestment([], {}, NOW, null, new Date(2026, 7, 31)).isCurrentMonth).toBe(true)
    expect(computeInvestment([], {}, NOW, null, JUL).isCurrentMonth).toBe(false)
    expect(computeInvestment([], {}, NOW, null, new Date(2026, 8, 1)).isCurrentMonth).toBe(false)
  })

  it('is true when no month is passed at all', () => {
    expect(computeInvestment([], {}, NOW).isCurrentMonth).toBe(true)
  })
})

describe('computeInvestment — nothing to report', () => {
  it('separates "no data" from a real zero', () => {
    const empty = computeInvestment([], { base: 'income', percent: 10 }, NOW, null, JUL)
    expect(empty.targetAmount).toBe(0)
    expect(empty.hasData).toBe(false)

    const quiet = computeInvestment([tx('2026-07-02', 0)], { base: 'income', percent: 10 }, NOW, null, JUL)
    expect(quiet.hasData).toBe(false) // a ₪0 row is still nothing to invest

    const real = computeInvestment([tx('2026-07-02', 100)], { base: 'income', percent: 0 }, NOW, null, JUL)
    expect(real.targetAmount).toBe(0) // 0% of real income
    expect(real.hasData).toBe(true)
  })

  it('survives a null transactions list (still loading)', () => {
    expect(computeInvestment(null, { base: 'income', percent: 10 }, NOW, null, JUL).targetAmount).toBe(0)
  })
})
