/* ════════════════════════════════════════════════════════════════
   ACCOUNT RESET — what "delete all my data" leaves behind.
   ════════════════════════════════════════════════════════════════
   The phone kept its own copy of the reset. It covered 23 of web's 30
   tables and had neither of web's outward-facing steps, so a reset from
   the phone left the coach's public booking, site and lead pages online
   and still taking submissions, and left Google Calendar and the invoice
   provider connected. The lists now come from core; these pin the steps
   and their order.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const log = vi.hoisted(() => ({ calls: [], failFn: null }))

vi.mock('../src/lib/supabase', () => {
  const from = (table) => {
    const s = {}
    const q = {
      delete: () => { s.op = 'delete'; return q },
      update: (payload) => { s.op = 'update'; s.payload = payload; return q },
      not: () => q,
      is: () => q,
      then: (resolve, reject) => {
        log.calls.push({ kind: s.op, table, payload: s.payload })
        return Promise.resolve({ error: null }).then(resolve, reject)
      },
    }
    return q
  }
  return {
    supabase: {
      from,
      rpc: async (name) => { log.calls.push({ kind: 'rpc', name }); return { error: null } },
      functions: {
        invoke: async (fn, opts) => {
          log.calls.push({ kind: 'fn', fn, action: opts?.body?.action })
          return log.failFn === fn ? { data: null, error: { message: 'offline' } } : { data: {}, error: null }
        },
      },
    },
  }
})

const { resetAllUserData } = await import('../src/lib/account')
const {
  ACCOUNT_RESET_SOFT_DELETE_TABLES, ACCOUNT_RESET_HARD_DELETE_TABLES, ACCOUNT_RESET_UNPUBLISH_TABLES,
} = await import('@simplicity/core')

beforeEach(() => { log.calls = []; log.failFn = null })

const indexOf = (pred) => log.calls.findIndex(pred)

describe('resetAllUserData', () => {
  it('disconnects Google Calendar and the invoice provider before touching any table', async () => {
    await resetAllUserData()
    const fns = log.calls.filter((c) => c.kind === 'fn')
    expect(fns).toEqual([
      { kind: 'fn', fn: 'google-calendar', action: 'disconnect' },
      { kind: 'fn', fn: 'invoices', action: 'disconnect' },
    ])
    expect(indexOf((c) => c.kind === 'fn' && c.fn === 'invoices')).toBeLessThan(indexOf((c) => c.kind !== 'fn'))
  })

  it('takes every public page offline, not just out of the lists', async () => {
    await resetAllUserData()
    for (const table of ACCOUNT_RESET_UNPUBLISH_TABLES) {
      const unpublish = indexOf((c) => c.table === table && c.payload?.published === false)
      const softDelete = indexOf((c) => c.table === table && c.payload?.deleted_at)
      expect(unpublish).toBeGreaterThan(-1)
      expect(unpublish).toBeLessThan(softDelete)
    }
  })

  it('clears every table core lists, and the reports ledger', async () => {
    await resetAllUserData()
    const soft = log.calls.filter((c) => c.kind === 'update' && c.payload?.deleted_at).map((c) => c.table)
    const hard = log.calls.filter((c) => c.kind === 'delete').map((c) => c.table)
    expect(soft).toEqual([...ACCOUNT_RESET_SOFT_DELETE_TABLES])
    expect(hard).toEqual([...ACCOUNT_RESET_HARD_DELETE_TABLES])
    expect(soft).toEqual(expect.arrayContaining(['booking_pages', 'site_pages', 'payment_plans', 'client_adjustments', 'meeting_types']))
    expect(log.calls.at(-1)).toEqual({ kind: 'rpc', name: 'report_tallies_reset_own' })
  })

  it('still wipes the data when a provider cannot be reached, and says which one', async () => {
    log.failFn = 'google-calendar'
    await expect(resetAllUserData()).rejects.toThrow(/Google Calendar: offline/)
    expect(log.calls.filter((c) => c.kind === 'update' && c.payload?.deleted_at)).toHaveLength(ACCOUNT_RESET_SOFT_DELETE_TABLES.length)
  })
})
