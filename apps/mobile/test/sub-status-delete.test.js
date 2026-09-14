/* ════════════════════════════════════════════════════════════════
   DELETING A CLIENT SUB-STATUS — no client is left on a status that
   no longer exists, and undo puts back exactly what it moved.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi } from 'vitest'
import { deleteSubStatusMovingClients } from '../src/lib/subStatuses'

const status = { id: 'st-old', display_name: 'בתהליך' }

function writes() {
  const log = []
  let undo
  return {
    log,
    get undo() { return undo },
    reassign: vi.fn(async (ids, toId) => { log.push(['move', ids, toId]) }),
    remove: vi.fn(async (id) => { log.push(['remove', id]) }),
    restore: vi.fn(async (id) => { log.push(['restore', id]) }),
    pushUndo: (entry) => { undo = entry },
  }
}

describe('deleteSubStatusMovingClients', () => {
  it('moves the clients before the status goes, to the chosen peer', async () => {
    const w = writes()
    await deleteSubStatusMovingClients({ status, ids: ['c1', 'c2'], toId: 'st-new', ...w, label: 'x' })
    expect(w.log).toEqual([['move', ['c1', 'c2'], 'st-new'], ['remove', 'st-old']])
  })

  it('"no sub-status" clears the link instead of leaving it dangling', async () => {
    const w = writes()
    await deleteSubStatusMovingClients({ status, ids: ['c1'], toId: null, ...w, label: 'x' })
    expect(w.log[0]).toEqual(['move', ['c1'], null])
  })

  it('a status nobody is on is simply deleted', async () => {
    const w = writes()
    await deleteSubStatusMovingClients({ status, ids: [], ...w, label: 'x' })
    expect(w.log).toEqual([['remove', 'st-old']])
  })

  it('undo restores the status and moves back exactly those clients', async () => {
    const w = writes()
    const onChanged = vi.fn()
    await deleteSubStatusMovingClients({ status, ids: ['c1', 'c2'], toId: 'st-new', ...w, label: 'x', onChanged })
    w.log.length = 0
    await w.undo.undo()
    expect(w.log).toEqual([['restore', 'st-old'], ['move', ['c1', 'c2'], 'st-old']])
    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('a failed move stops the delete, so nothing is orphaned', async () => {
    const w = writes()
    w.reassign.mockRejectedValueOnce(new Error('offline'))
    await expect(deleteSubStatusMovingClients({ status, ids: ['c1'], toId: null, ...w, label: 'x' })).rejects.toThrow('offline')
    expect(w.remove).not.toHaveBeenCalled()
  })
})
