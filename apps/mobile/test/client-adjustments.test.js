/* ════════════════════════════════════════════════════════════════
   ADJUSTMENTS — the figure and the row that explains it, in step.
   ════════════════════════════════════════════════════════════════
   Pinned, as web's hook does them:
     · adding reads the figure FRESH, writes it first, then the row; a row
       that fails to insert does not fail the adjustment;
     · undo restores the exact prior figure and retires the row;
     · removing retires the row first, and puts it back if the figure
       cannot be written;
     · an amount the rows do not explain is reported, not hidden.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi } from 'vitest'
import { applyAdjustment, retractAdjustment, unexplainedGap, signedAmount } from '../src/lib/clientAdjustments'

const client = { id: 'c1', paid_adjustment: 0, balance_adjustment: 0 }
const deps = (over = {}) => {
  const calls = []
  return {
    calls,
    readScalar: vi.fn(async () => 100),
    writeScalar: vi.fn(async (id, patch) => { calls.push(['write', patch]) }),
    insertRow: vi.fn(async (row) => { calls.push(['insert', row]); return { id: 'a1', ...row } }),
    removeRow: vi.fn(async (id) => { calls.push(['remove', id]) }),
    restoreRow: vi.fn(async (id) => { calls.push(['restore', id]) }),
    pushUndo: vi.fn(),
    ...over,
  }
}

describe('adding an adjustment', () => {
  it('bases the new figure on the stored value, not the one on screen, and writes it before the row', async () => {
    const d = deps()
    await applyAdjustment({ client, kind: 'paid', reason: 'unrecorded_payment', amount: 50, note: 'מזומן', ...d })
    expect(d.readScalar).toHaveBeenCalledWith('c1', 'paid_adjustment')
    expect(d.calls).toEqual([
      ['write', { paid_adjustment: 150 }],
      ['insert', { client_id: 'c1', kind: 'paid', reason: 'unrecorded_payment', amount: 50, note: 'מזומן' }],
    ])
  })

  it('a discount moves the balance column', async () => {
    const d = deps()
    await applyAdjustment({ client, kind: 'balance', reason: 'discount', amount: 30, ...d })
    expect(d.writeScalar).toHaveBeenCalledWith('c1', { balance_adjustment: 130 })
  })

  it('stands when the ledger row cannot be written', async () => {
    const d = deps({ insertRow: vi.fn(async () => { throw new Error('no table') }) })
    await expect(applyAdjustment({ client, kind: 'paid', reason: 'import_fix', amount: -20, ...d })).resolves.toBeNull()
    expect(d.writeScalar).toHaveBeenCalledWith('c1', { paid_adjustment: 80 })
  })

  it('undo puts back the exact prior figure and retires the row', async () => {
    const d = deps()
    await applyAdjustment({ client, kind: 'paid', reason: 'unrecorded_payment', amount: 50, ...d })
    await d.pushUndo.mock.calls[0][0].undo()
    expect(d.writeScalar).toHaveBeenLastCalledWith('c1', { paid_adjustment: 100 })
    expect(d.removeRow).toHaveBeenCalledWith('a1')
  })
})

describe('removing an adjustment', () => {
  const adjustment = { id: 'a9', kind: 'paid', amount: 40 }

  it('retires the row, then takes the money back', async () => {
    const d = deps()
    await retractAdjustment({ client, adjustment, ...d })
    expect(d.calls).toEqual([['remove', 'a9'], ['write', { paid_adjustment: 60 }]])
  })

  it('puts the row back and fails when the figure cannot be written', async () => {
    const d = deps({ writeScalar: vi.fn(async () => { throw new Error('offline') }) })
    await expect(retractAdjustment({ client, adjustment, ...d })).rejects.toThrow('offline')
    expect(d.restoreRow).toHaveBeenCalledWith('a9')
    expect(d.pushUndo).not.toHaveBeenCalled()
  })
})

describe('the payments panel arithmetic', () => {
  it('reports what the rows do not explain', () => {
    expect(unexplainedGap({ paid_adjustment: 150 }, 'paid_adjustment', [{ amount: 100 }])).toBe(50)
    expect(unexplainedGap({ paid_adjustment: 100 }, 'paid_adjustment', [{ amount: 100 }])).toBeNull()
  })

  it('signs by the amount', () => {
    expect(signedAmount(-20).startsWith('−')).toBe(true)
    expect(signedAmount(20).startsWith('+')).toBe(true)
  })
})
