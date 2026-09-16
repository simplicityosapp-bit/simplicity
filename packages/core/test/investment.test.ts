/* The investment figure moved here from apps/web so the phone computes the
   same one. The full behaviour is pinned by apps/web/test/investment-
   settings.test.js through its re-export; this keeps core's own suite from
   shipping the module untested. */
import { describe, it, expect } from 'vitest'
import { computeInvestment, migrateInvestmentSettings, normalizePercent } from '../src'

const NOW = new Date(2026, 7, 15, 12)
const tx = (date: string, amount: number, type = 'income', id = `${date}${type}${amount}`) => ({ id, date, amount, type, status: 'confirmed' })

describe('investment settings', () => {
  it('fills defaults and repairs bad values', () => {
    expect(migrateInvestmentSettings({ base: 'nope' as never, percent: 250, view: 'x' as never })).toEqual({ base: 'income', percent: 100, view: 'monthly' })
    expect(normalizePercent('')).toBe(10)
  })
})

describe('computeInvestment', () => {
  it('takes the percentage of the month on screen', () => {
    const r = computeInvestment([tx('2026-08-03', 10000), tx('2026-08-04', 4000, 'expense')], { base: 'net', percent: 10 }, NOW)
    expect(r.targetAmount).toBe(600)
    expect(r.basisFellBack).toBe(false)
  })

  it("never lets an investment's own expense shrink the base", () => {
    const r = computeInvestment(
      [tx('2026-08-03', 10000), tx('2026-08-05', 1000, 'expense', 'inv-tx')],
      { base: 'net', percent: 10 }, NOW,
      [{ id: 'i1', amount: 1000, invested_on: '2026-08-05', transaction_id: 'inv-tx' }],
    )
    expect(r.targetAmount).toBe(1000)
    expect(r.investedInMonth).toBe(1000)
  })

  it('falls back one month when the month on screen took nothing in', () => {
    const r = computeInvestment([tx('2026-07-10', 5000)], { percent: 20 }, NOW)
    expect(r.basisFellBack).toBe(true)
    expect(r.targetAmount).toBe(1000)
  })
})
