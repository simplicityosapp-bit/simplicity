/* ════════════════════════════════════════════════════════════════
   MEETING-UNDO SUITE — confirming or skipping a meeting is reversible
   (lib/scheduledMeetings + lib/undo).

   ✓ on a pending meeting was the most consequential one-tap action on the
   home screen: it materialises a real session, which feeds the client's
   session count and their balance. It had no confirm step and no way back —
   while merely snoozing a client did offer one. ✕ was no better: it dropped
   the materialised session AND skipped the expense the meeting would have
   incurred, in one tap.

   The subtle part is that pushUndo is SINGLE-LEVEL. removeSession registers
   an undo of its own, so a naive implementation ends up with the session
   restore replacing the meeting restore — you press undo, the session comes
   back, and the meeting stays skipped. Hence removeSession({ silent: true })
   and one composite undo. That is what most of this suite is guarding.

   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeEach } from 'vitest'
import { confirmScheduledMeeting, skipScheduledMeeting } from '../src/lib/scheduledMeetings'
import { pushUndo, performUndo, performRedo, getSnapshot, dismiss } from '../src/lib/undo'

/* Recording stand-ins for the hook callbacks the helpers are given. */
function harness({ newSessionId = 'sess-new' } = {}) {
  const calls = { added: [], updated: [], removed: [], putBack: [], tx: [] }
  return {
    calls,
    addSession: async (payload) => { calls.added.push(payload); return { id: newSessionId, ...payload } },
    updateMeeting: async (id, patch) => { calls.updated.push({ id, ...patch }) },
    removeSession: async (id, opts) => { calls.removed.push({ id, opts }) },
    putBackSession: async (id) => { calls.putBack.push(id) },
    setTxStatus: async (id, status) => { calls.tx.push({ id, status }) },
  }
}

const meeting = (over = {}) => ({
  id: 'm1', subject_type: 'client', subject_id: 'c1',
  scheduled_at: '2026-07-21T09:00:00.000Z', status: 'pending', session_id: null, ...over,
})

beforeEach(() => { dismiss() })

describe('confirming a meeting', () => {
  it('materialises a session and links it', async () => {
    const h = harness()
    await confirmScheduledMeeting({ meeting: meeting(), sessions: [], ...h })
    expect(h.calls.added).toHaveLength(1)
    expect(h.calls.updated).toEqual([{ id: 'm1', status: 'confirmed', session_id: 'sess-new' }])
  })

  it('offers an undo rather than just a confirmation toast', async () => {
    const h = harness()
    await confirmScheduledMeeting({ meeting: meeting(), sessions: [], ...h })
    expect(getSnapshot().phase).toBe('offer')
  })

  it('undo removes the session it created and puts the meeting back', async () => {
    const h = harness()
    await confirmScheduledMeeting({ meeting: meeting(), sessions: [], ...h })
    await performUndo()
    expect(h.calls.removed.map((r) => r.id)).toEqual(['sess-new'])
    expect(h.calls.updated.at(-1)).toEqual({ id: 'm1', status: 'pending', session_id: null })
  })

  it('removes it SILENTLY, so the session undo cannot replace the meeting undo', async () => {
    /* The whole point: pushUndo is single-level. A non-silent remove would
       register its own undo during ours and strand the status change. */
    const h = harness()
    await confirmScheduledMeeting({ meeting: meeting(), sessions: [], ...h })
    await performUndo()
    expect(h.calls.removed[0].opts).toEqual({ silent: true })
  })

  it('restores the PREVIOUS status and link, not a hard-coded pending/null', async () => {
    const h = harness()
    const m = meeting({ status: 'skipped', session_id: 'sess-old' })
    await confirmScheduledMeeting({ meeting: m, sessions: [], ...h })
    await performUndo()
    expect(h.calls.updated.at(-1)).toEqual({ id: 'm1', status: 'skipped', session_id: 'sess-old' })
  })

  it('creates nothing for a per-session client — they are billed separately', async () => {
    /* Auto-materialising here would double-count against their one-off charge. */
    const h = harness()
    const clients = [{ id: 'c1', billing_mode: 'per_session' }]
    await confirmScheduledMeeting({ meeting: meeting(), sessions: [], clients, ...h })
    expect(h.calls.added).toHaveLength(0)
    await performUndo()
    expect(h.calls.removed).toHaveLength(0)
    expect(h.calls.updated.at(-1)).toEqual({ id: 'm1', status: 'pending', session_id: null })
  })

  it('redo restores the same session row rather than inserting a second one', async () => {
    const h = harness()
    await confirmScheduledMeeting({ meeting: meeting(), sessions: [], ...h })
    await performUndo()
    await performRedo()
    expect(h.calls.added).toHaveLength(1)          // still just the original insert
    expect(h.calls.putBack).toEqual(['sess-new'])  // the same row, put back
    expect(h.calls.updated.at(-1)).toEqual({ id: 'm1', status: 'confirmed', session_id: 'sess-new' })
  })
})

describe('skipping a meeting', () => {
  it('marks it skipped and clears the link', async () => {
    const h = harness()
    await skipScheduledMeeting({ meeting: meeting(), ...h })
    expect(h.calls.updated[0]).toEqual({ id: 'm1', status: 'skipped', session_id: null })
  })

  it('drops a materialised session, silently, and puts it back on undo', async () => {
    const h = harness()
    await skipScheduledMeeting({ meeting: meeting({ session_id: 'sess-x' }), ...h })
    expect(h.calls.removed).toEqual([{ id: 'sess-x', opts: { silent: true } }])
    await performUndo()
    expect(h.calls.putBack).toEqual(['sess-x'])
    expect(h.calls.updated.at(-1)).toEqual({ id: 'm1', status: 'pending', session_id: 'sess-x' })
  })

  it('skips the expenses the meeting would have incurred', async () => {
    const h = harness()
    const linkedTxs = [{ id: 'tx1', status: 'pending' }, { id: 'tx2', status: 'pending' }]
    await skipScheduledMeeting({ meeting: meeting(), linkedTxs, ...h })
    expect(h.calls.tx).toEqual([{ id: 'tx1', status: 'skipped' }, { id: 'tx2', status: 'skipped' }])
  })

  it('undo returns each expense to the status it actually had', async () => {
    /* Restoring everything to 'pending' would resurrect an expense the user
       had already skipped by hand. */
    const h = harness()
    const linkedTxs = [{ id: 'tx1', status: 'pending' }, { id: 'tx2', status: 'skipped' }]
    await skipScheduledMeeting({ meeting: meeting(), linkedTxs, ...h })
    h.calls.tx.length = 0
    await performUndo()
    expect(h.calls.tx).toEqual([{ id: 'tx1', status: 'pending' }, { id: 'tx2', status: 'skipped' }])
  })

  it('reverses the meeting, the session and the expenses in ONE undo', async () => {
    const h = harness()
    await skipScheduledMeeting({
      meeting: meeting({ session_id: 'sess-x' }),
      linkedTxs: [{ id: 'tx1', status: 'pending' }], ...h,
    })
    await performUndo()
    expect(h.calls.putBack).toEqual(['sess-x'])
    expect(h.calls.updated.at(-1)).toEqual({ id: 'm1', status: 'pending', session_id: 'sess-x' })
    expect(h.calls.tx.at(-1)).toEqual({ id: 'tx1', status: 'pending' })
  })

  it('handles a meeting with no session and no linked expense', async () => {
    const h = harness()
    await skipScheduledMeeting({ meeting: meeting(), ...h })
    await performUndo()
    expect(h.calls.removed).toHaveLength(0)
    expect(h.calls.putBack).toHaveLength(0)
    expect(h.calls.updated.at(-1)).toEqual({ id: 'm1', status: 'pending', session_id: null })
  })
})

describe('the undo store itself', () => {
  it('keeps only the most recent action — which is why the composite undo exists', async () => {
    const seen = []
    pushUndo({ label: 'first', undo: async () => seen.push('first'), redo: async () => {} })
    pushUndo({ label: 'second', undo: async () => seen.push('second'), redo: async () => {} })
    await performUndo()
    expect(seen).toEqual(['second'])
  })
})
