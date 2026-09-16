/* ════════════════════════════════════════════════════════════════
   RECORDING AN INVESTMENT — the pair and its two invariants
   ════════════════════════════════════════════════════════════════
   "השקעתי" writes an expense and an investments record. Pinned: the amount
   stored is the whole-shekel figure the button showed; both rows carry
   the same day; a record that fails to save takes its expense back out
   (an unlinked expense would shrink next month's target); and a record
   whose expense was deleted stops counting.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi } from 'vitest'
import { recordInvestmentPair, liveInvestments, localDateString } from '../src/lib/investments'

const deps = (over = {}) => ({
  ensureCategory: vi.fn(async () => 'cat-inv'),
  addTransaction: vi.fn(async (row) => ({ id: 'tx-1', ...row })),
  insertInvestment: vi.fn(async (row) => ({ id: 'inv-1', ...row })),
  rollbackTransaction: vi.fn(async () => {}),
  txDesc: 'השקעה',
  ...over,
})

describe('recordInvestmentPair', () => {
  it('stores the rounded figure on both rows, on the same day, linked', async () => {
    const d = deps()
    const row = await recordInvestmentPair({ amount: 125.4, investedOn: '2026-08-31' }, d)
    expect(d.addTransaction).toHaveBeenCalledWith({ amount: 125, type: 'expense', date: '2026-08-31', desc: 'השקעה', category_id: 'cat-inv', status: 'confirmed' })
    expect(d.insertInvestment).toHaveBeenCalledWith({ amount: 125, invested_on: '2026-08-31', transaction_id: 'tx-1', note: null })
    expect(row).toMatchObject({ id: 'inv-1', transaction_id: 'tx-1' })
  })

  it('defaults both rows to the local today', async () => {
    const d = deps()
    await recordInvestmentPair({ amount: 100 }, d)
    const today = localDateString()
    expect(d.addTransaction.mock.calls[0][0].date).toBe(today)
    expect(d.insertInvestment.mock.calls[0][0].invested_on).toBe(today)
  })

  it('records nothing for a zero or negative figure', async () => {
    const d = deps()
    expect(await recordInvestmentPair({ amount: 0.3 }, d)).toBeNull()
    expect(d.addTransaction).not.toHaveBeenCalled()
  })

  it('rolls the expense back when the record fails, and still fails', async () => {
    const d = deps({ insertInvestment: vi.fn(async () => { throw new Error('rls') }) })
    await expect(recordInvestmentPair({ amount: 500 }, d)).rejects.toThrow('rls')
    expect(d.rollbackTransaction).toHaveBeenCalledWith('tx-1')
  })

  it('a failed rollback does not hide the original failure', async () => {
    const d = deps({ insertInvestment: vi.fn(async () => { throw new Error('rls') }), rollbackTransaction: vi.fn(() => { throw new Error('offline') }) })
    await expect(recordInvestmentPair({ amount: 500 }, d)).rejects.toThrow('rls')
  })
})

describe('localDateString', () => {
  it('is the local calendar day, not the UTC one', () => {
    expect(localDateString(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
  })
})

describe('liveInvestments', () => {
  const rows = [
    { id: 'a', transaction_id: 't1', amount: 100 },
    { id: 'b', transaction_id: 't-gone', amount: 200 },
    { id: 'c', transaction_id: null, amount: 50 },
  ]

  it('drops a record whose expense is no longer in the ledger', () => {
    expect(liveInvestments(rows, [{ id: 't1' }], true).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('judges nothing while the ledger is still loading', () => {
    expect(liveInvestments(rows, [], false)).toBe(rows)
  })
})
