/* ════════════════════════════════════════════════════════════════
   PAYMENT-PLANS SUITE — installment generation + balance arithmetic.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { generateInstallments, planBalance, addMonths, installmentsCoveredByPaid } from '../src/lib/paymentPlans'

describe('addMonths', () => {
  it('adds whole months without UTC drift', () => {
    expect(addMonths('2026-01-01', 0)).toBe('2026-01-01')
    expect(addMonths('2026-01-01', 1)).toBe('2026-02-01')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
  })
})

describe('generateInstallments', () => {
  it('splits a clean total into equal installments', () => {
    const rows = generateInstallments({ total: 3600, count: 6, startDate: '2026-07-01' })
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.amount === 600)).toBe(true)
    expect(rows.map((r) => r.num)).toEqual([1, 2, 3, 4, 5, 6])
    expect(rows[0].due_date).toBe('2026-07-01')
    expect(rows[5].due_date).toBe('2026-12-01')
  })
  it('absorbs the rounding remainder in the LAST installment so the sum is exact', () => {
    const rows = generateInstallments({ total: 100, count: 3, startDate: '2026-07-01' })
    const sum = rows.reduce((s, r) => s + r.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(100)
    expect(rows[0].amount).toBe(33.33)
    expect(rows[2].amount).toBe(33.34)
  })
  it('defaults to a single installment for bad counts', () => {
    expect(generateInstallments({ total: 500, count: 0, startDate: '2026-07-01' })).toHaveLength(1)
  })
})

describe('planBalance', () => {
  const plan = { total_amount: 3600 }
  it('sums received installments and computes the remaining', () => {
    const inst = [
      { amount: 600, received: true }, { amount: 600, received: true },
      { amount: 600, received: false }, { amount: 600, received: false },
    ]
    const b = planBalance(plan, inst)
    expect(b.total).toBe(3600)
    expect(b.received).toBe(1200)
    expect(b.remaining).toBe(2400)
    expect(b.receivedCount).toBe(2)
  })
  it('clamps remaining at 0 when over-collected and ignores soft-deleted rows', () => {
    const b = planBalance({ total_amount: 1000 }, [
      { amount: 600, received: true }, { amount: 600, received: true },
      { amount: 600, received: true, deleted_at: '2026-01-01' },
    ])
    expect(b.received).toBe(1200)
    expect(b.remaining).toBe(0)
  })
})

describe('installmentsCoveredByPaid (import: how many installments paid covers)', () => {
  const amounts = [600, 600, 600, 600, 600, 600]
  it('counts whole installments a paid amount covers', () => {
    expect(installmentsCoveredByPaid(amounts, 0)).toBe(0)
    expect(installmentsCoveredByPaid(amounts, 1200)).toBe(2)
    expect(installmentsCoveredByPaid(amounts, 3600)).toBe(6)
  })
  it('does not count a partially-covered installment', () => {
    expect(installmentsCoveredByPaid(amounts, 900)).toBe(1)
  })
  it('never exceeds the number of installments', () => {
    expect(installmentsCoveredByPaid(amounts, 99999)).toBe(6)
  })
})
