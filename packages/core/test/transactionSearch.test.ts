/* The money search and the net chart geometry both apps now draw from. Web's
   own tests pin the full rule sets through its re-exports; these cover the
   core entry points. */
import { describe, it, expect } from 'vitest'
import { searchTransactions } from '../src/domain/transactionSearch'
import { netChartGeometry, CHART_H, CHART_PAD_BOTTOM, CHART_PAD_TOP } from '../src/domain/netChartGeometry'

const txs = [
  { id: 't1', type: 'income', desc: 'סדנה', amount: 1200, date: '2026-07-10', client_id: 'c1' },
  { id: 't2', type: 'expense', desc: 'שכירות', amount: 300, date: '2026-09-01', category_id: 'k1' },
  { id: 't3', type: 'income', desc: 'פגישה', amount: 300, date: '2026-09-05', deleted_at: '2026-09-06' },
]
const lookups = { clients: [{ id: 'c1', name: 'Dana' }], categories: [{ id: 'k1', name: 'משרד' }] }

describe('searchTransactions', () => {
  it('matches client and category names, case-insensitively, newest first', () => {
    expect(searchTransactions(txs, { query: 'dana', ...lookups }).map((t) => t.id)).toEqual(['t1'])
    expect(searchTransactions(txs, { query: 'משרד', ...lookups }).map((t) => t.id)).toEqual(['t2'])
    expect(searchTransactions(txs, lookups).map((t) => t.id)).toEqual(['t2', 't1'])
  })
  it('prefix-matches amounts, filters by type, and drops deleted rows', () => {
    expect(searchTransactions(txs, { query: '1,2' }).map((t) => t.id)).toEqual(['t1'])
    expect(searchTransactions(txs, { type: 'expense' }).map((t) => t.id)).toEqual(['t2'])
    expect(searchTransactions(txs, { query: '300' }).map((t) => t.id)).toEqual(['t2'])
  })
})

describe('netChartGeometry', () => {
  it('fills to the zero line and pins an out-of-range goal', () => {
    const g = netChartGeometry({ cumNet: [0, -200, 100], daysInMonth: 3, targetValue: 9000, todayIdx: 1 })
    expect(g.showZeroLine).toBe(true)
    expect(g.area.endsWith(`,${g.zeroY.toFixed(1)} Z`)).toBe(true)
    expect(g.goalClamped).toBe(true)
    expect(g.goalY).toBeGreaterThanOrEqual(CHART_PAD_TOP)
    expect(g.goalY).toBeLessThanOrEqual(CHART_H - CHART_PAD_BOTTOM)
  })
})
