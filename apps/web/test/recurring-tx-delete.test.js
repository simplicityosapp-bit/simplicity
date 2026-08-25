/* ════════════════════════════════════════════════════════════════
   DELETING ONE OCCURRENCE OF A RECURRING RULE.
   ════════════════════════════════════════════════════════════════
   A recurring transaction is the OUTPUT of a template, so soft-deleting it
   frees the (recurring_id, date) slot and the generator refills it on the very
   next mount — observed in production as four rows on one slot, the last
   regenerated thirteen seconds after the third delete.

   The first test below pins the regeneration itself, so nobody "fixes" the
   delete by feeding deleted rows back into the engine and calls it done: the
   30-day purge takes those tombstones away again. The rest pin the actual
   contract — a delete only sticks if the rule stops owning the slot. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateRecurringTransactions } from '@simplicity/core'
import { owningTemplate, removeTransactionAndRule } from '../src/lib/recurringTx'

vi.mock('../src/lib/undo', () => ({ pushUndo: vi.fn() }))
import { pushUndo } from '../src/lib/undo'

const NOW = new Date('2026-08-25T10:00:00')
const monthly = {
  id: 'tmpl1', active: true, trigger_type: 'schedule', cadence_type: 'monthly_date',
  day_of_month: 25, amount: 200, type: 'income', created_at: '2026-07-01T00:00:00Z',
}
const july = { id: 'tx-jul', recurring_id: 'tmpl1', date: '2026-07-25', status: 'confirmed' }
const august = { id: 'tx-aug', recurring_id: 'tmpl1', date: '2026-08-25', status: 'pending' }

describe('the regeneration this delete has to stop', () => {
  it('refills the slot as soon as the deleted row leaves the list', () => {
    /* listTransactions filters deleted_at, so a deleted August row simply is
       not in the array the engine reads. */
    const out = generateRecurringTransactions([monthly], [july], NOW, [])
    expect(out.map((p) => p.date)).toEqual(['2026-08-25'])
  })

  it('stops once the rule is paused — the whole point of pausing it', () => {
    const paused = { ...monthly, active: false }
    expect(generateRecurringTransactions([paused], [july], NOW, [])).toHaveLength(0)
  })

  it('regenerates the ENTIRE history when every row for the rule is gone', () => {
    /* The anchor falls back to the template's created_at, so deleting the last
       surviving row is not a small mistake. */
    const out = generateRecurringTransactions([monthly], [], NOW, [])
    expect(out.map((p) => p.date)).toEqual(['2026-07-25', '2026-08-25'])
  })
})

describe('owningTemplate', () => {
  it('finds the rule that would refill the slot', () => {
    expect(owningTemplate(august, [monthly])?.id).toBe('tmpl1')
  })

  it('ignores a paused or soft-deleted rule — those refill nothing', () => {
    expect(owningTemplate(august, [{ ...monthly, active: false }])).toBeNull()
    expect(owningTemplate(august, [{ ...monthly, deleted_at: '2026-08-01' }])).toBeNull()
  })

  it('ignores an ordinary transaction', () => {
    expect(owningTemplate({ id: 'tx-1' }, [monthly])).toBeNull()
  })
})

describe('removeTransactionAndRule', () => {
  let removeTransaction, putBackTransaction, updateRecurring
  beforeEach(() => {
    vi.clearAllMocks()
    removeTransaction = vi.fn().mockResolvedValue(undefined)
    putBackTransaction = vi.fn().mockResolvedValue(undefined)
    updateRecurring = vi.fn().mockResolvedValue(undefined)
  })
  const run = (tx, templates) => removeTransactionAndRule({
    tx, templates, removeTransaction, putBackTransaction, updateRecurring, label: 'לייבל',
  })

  it('pauses the rule behind the row, and owns the single undo', async () => {
    await run(august, [monthly])
    expect(removeTransaction).toHaveBeenCalledWith('tx-aug', { silent: true })
    expect(updateRecurring).toHaveBeenCalledWith('tmpl1', { active: false })
    expect(pushUndo).toHaveBeenCalledTimes(1)
  })

  it('undo puts both halves back', async () => {
    await run(august, [monthly])
    await pushUndo.mock.calls[0][0].undo()
    expect(putBackTransaction).toHaveBeenCalledWith('tx-aug')
    expect(updateRecurring).toHaveBeenLastCalledWith('tmpl1', { active: true })
  })

  it('leaves an ordinary transaction to the plain delete, with its own undo', async () => {
    await run({ id: 'tx-1' }, [monthly])
    expect(removeTransaction).toHaveBeenCalledWith('tx-1')   // not silent
    expect(updateRecurring).not.toHaveBeenCalled()
    expect(pushUndo).not.toHaveBeenCalled()
  })

  it('does not pause a rule that is already paused', async () => {
    await run(august, [{ ...monthly, active: false }])
    expect(removeTransaction).toHaveBeenCalledWith('tx-aug')
    expect(updateRecurring).not.toHaveBeenCalled()
  })
})

/* The mobile app hand-mirrors lib/recurringTx.js — it cannot import the web
   copy, and its own file pulls in react-native, so this compares the SOURCE of
   the one function both platforms must agree on. Drift between mirrored copies
   is the failure mode this repo keeps hitting; a one-line divergence here means
   one platform refills a slot the other retired. */
describe('the mobile mirror stays in step', () => {
  it('has a byte-identical owningTemplate', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const grab = (p) => {
      const src = readFileSync(join(here, p), 'utf8')
      const start = src.indexOf('export function owningTemplate')
      expect(start, `owningTemplate not found in ${p}`).toBeGreaterThan(-1)
      return src.slice(start, src.indexOf('\n}', start) + 2).replace(/\r\n/g, '\n')
    }
    expect(grab('../../mobile/src/lib/recurringTx.js')).toBe(grab('../src/lib/recurringTx.js'))
  })
})
