/* ════════════════════════════════════════════════════════════════
   AN INVESTMENT'S EXPENSE is deleted and restored with its record.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { softDeleteLinkedInvestments, restoreLinkedInvestments } from '../src/lib/linkedInvestments'

function recorder({ fail = false } = {}) {
  const calls = []
  const client = {
    from: (table) => {
      const c = { table, filters: [] }
      calls.push(c)
      const q = {
        update: (patch) => { c.patch = patch; return q },
        eq: (col, v) => { c.filters.push(['eq', col, v]); return q },
        is: (col, v) => { c.filters.push(['is', col, v]); return q },
        not: (col, op, v) => { c.filters.push(['not', col, op, v]); return q },
        then: (res, rej) => (fail ? Promise.reject(new Error('offline')) : Promise.resolve({ error: null })).then(res, rej),
      }
      return q
    },
  }
  return { client, calls }
}

describe('linked investments', () => {
  it('deleting an expense retires the live investment that points at it', async () => {
    const { client, calls } = recorder()
    await softDeleteLinkedInvestments(client, 'tx-1')
    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('investments')
    expect(calls[0].patch.deleted_at).toEqual(expect.any(String))
    expect(calls[0].filters).toEqual([['eq', 'transaction_id', 'tx-1'], ['is', 'deleted_at', null]])
  })

  it('restoring the expense brings the investment back', async () => {
    const { client, calls } = recorder()
    await restoreLinkedInvestments(client, 'tx-1')
    expect(calls[0].patch).toEqual({ deleted_at: null })
    expect(calls[0].filters).toEqual([['eq', 'transaction_id', 'tx-1'], ['not', 'deleted_at', 'is', null]])
  })

  it('never throws — the transaction write has already landed', async () => {
    const { client } = recorder({ fail: true })
    await expect(softDeleteLinkedInvestments(client, 'tx-1')).resolves.toBeUndefined()
    await expect(restoreLinkedInvestments(client, 'tx-1')).resolves.toBeUndefined()
  })

  it('does nothing without a transaction', async () => {
    const { client, calls } = recorder()
    await softDeleteLinkedInvestments(client, null)
    expect(calls).toHaveLength(0)
  })
})
