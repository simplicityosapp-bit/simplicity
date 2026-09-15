/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS — confirming one, and skipping one.
   ════════════════════════════════════════════════════════════════
   Both take their writes as arguments, so the interesting behaviour can
   be checked without a database: what gets created, what does NOT get
   created twice, and what still happens when a write fails.

   Two rules carry the weight. Confirming a meeting that already has a
   session must not materialise a second one — a duplicated session is
   billable work invented out of a double tap. And a failed session insert
   must still leave the meeting confirmed, or the row is stuck in a state
   the user cannot clear.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi } from 'vitest'
import {
  nextSessionNum,
  confirmScheduledMeeting,
  skipScheduledMeeting,
  billPerSessionMeeting,
  rescheduleScheduledMeeting,
} from '../src/lib/scheduledMeetings'

const clientMeeting = { id: 'm1', subject_type: 'client', subject_id: 'c1', scheduled_at: '2026-09-08T09:00:00.000Z' }
const groupMeeting = { id: 'm2', subject_type: 'group', subject_id: 'g1', scheduled_at: '2026-09-08T09:00:00.000Z' }

describe('nextSessionNum', () => {
  const sessions = [
    { client_id: 'c1' }, { client_id: 'c1' },
    { client_id: 'c2' },
    { group_id: 'g1' },
  ]

  it('counts only the subject its own sessions', () => {
    expect(nextSessionNum(sessions, clientMeeting)).toBe(3)
    expect(nextSessionNum(sessions, groupMeeting)).toBe(2)
  })

  /* A group meeting counts group sessions, not the client sessions that
     happen to share the id space — getting this backwards would number
     every group session 1. */
  it('does not mix a group up with a client', () => {
    const mixed = [{ client_id: 'x1' }, { client_id: 'x1' }]
    expect(nextSessionNum(mixed, { subject_type: 'group', subject_id: 'x1' })).toBe(1)
  })

  it('starts at 1 with nothing recorded', () => {
    expect(nextSessionNum([], clientMeeting)).toBe(1)
    expect(nextSessionNum(undefined, clientMeeting)).toBe(1)
  })
})

describe('confirming a meeting', () => {
  it('materialises a session and links it', async () => {
    const addSession = vi.fn(async () => ({ id: 's9' }))
    const updateMeeting = vi.fn(async () => {})
    await confirmScheduledMeeting({ meeting: clientMeeting, sessions: [], addSession, updateMeeting })

    expect(addSession).toHaveBeenCalledTimes(1)
    expect(addSession.mock.calls[0][0]).toMatchObject({
      client_id: 'c1', group_id: null, subject_type: 'client', subject_id: 'c1', num: 1,
      date: '2026-09-08T09:00:00.000Z',
    })
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'confirmed', session_id: 's9' })
  })

  it('puts a group meeting on the group side, not the client side', async () => {
    const addSession = vi.fn(async () => ({ id: 's9' }))
    await confirmScheduledMeeting({ meeting: groupMeeting, sessions: [], addSession, updateMeeting: vi.fn(async () => {}) })
    expect(addSession.mock.calls[0][0]).toMatchObject({ client_id: null, group_id: 'g1' })
  })

  /* The dedup. A meeting that already carries a session_id has been
     confirmed before; creating another session would invent billable work
     out of a second tap. */
  it('never creates a second session for one already linked', async () => {
    const addSession = vi.fn()
    const updateMeeting = vi.fn(async () => {})
    await confirmScheduledMeeting({
      meeting: { ...clientMeeting, session_id: 's1' }, sessions: [], addSession, updateMeeting,
    })
    expect(addSession).not.toHaveBeenCalled()
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'confirmed' })
  })

  /* Best-effort by design: the user said it happened, so the meeting is
     confirmed even if the session write failed. Letting the error through
     would leave the row stuck in a state they cannot clear. */
  it('still confirms when the session write fails', async () => {
    const addSession = vi.fn(async () => { throw new Error('offline') })
    const updateMeeting = vi.fn(async () => {})
    await expect(
      confirmScheduledMeeting({ meeting: clientMeeting, sessions: [], addSession, updateMeeting }),
    ).resolves.toBeUndefined()
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'confirmed' })
  })

  it('does nothing at all without a meeting id', async () => {
    const addSession = vi.fn()
    const updateMeeting = vi.fn()
    await confirmScheduledMeeting({ meeting: {}, sessions: [], addSession, updateMeeting })
    expect(addSession).not.toHaveBeenCalled()
    expect(updateMeeting).not.toHaveBeenCalled()
  })
})

describe('a per-session client', () => {
  /* Every session such a client has is billed. The home tile used to create
     one on confirm, so confirming from home charged the client without the
     question the calendar asks. The charge is now always a separate, asked-for
     step, wherever the meeting is confirmed. */
  it('is confirmed without a session — the charge is asked for separately', async () => {
    const addSession = vi.fn()
    const updateMeeting = vi.fn(async () => {})
    await confirmScheduledMeeting({
      meeting: clientMeeting, sessions: [], addSession, updateMeeting,
      clients: [{ id: 'c1', billing_mode: 'per_session' }],
    })
    expect(addSession).not.toHaveBeenCalled()
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'confirmed' })
  })

  it('a package client still gets the session', async () => {
    const addSession = vi.fn(async () => ({ id: 's9' }))
    await confirmScheduledMeeting({
      meeting: clientMeeting, sessions: [], addSession, updateMeeting: vi.fn(async () => {}),
      clients: [{ id: 'c1', billing_mode: 'package' }],
    })
    expect(addSession).toHaveBeenCalledTimes(1)
  })

  it('the charge is one held session, unlinked, numbered after the live ones', async () => {
    const addSession = vi.fn(async (row) => ({ id: 'bill', ...row }))
    const sessions = [{ client_id: 'c1' }, { client_id: 'c1', deleted_at: '2026-09-01' }, { client_id: 'c2' }]
    await billPerSessionMeeting({ meeting: clientMeeting, sessions, addSession })
    expect(addSession).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'c1', group_id: null, num: 2, date: clientMeeting.scheduled_at }))
  })
})

describe('skipping a meeting', () => {
  /* Clearing session_id matters as much as deleting the row: a link left
     pointing at a session that no longer exists is a dangling reference
     the rest of the app would follow. */
  it('drops the session it materialised AND clears the link', async () => {
    const updateMeeting = vi.fn(async () => {})
    const removeSession = vi.fn(async () => {})
    await skipScheduledMeeting({ meeting: { ...clientMeeting, session_id: 's9' }, updateMeeting, removeSession })
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'skipped', session_id: null })
    expect(removeSession).toHaveBeenCalledWith('s9')
  })

  it('marks a never-confirmed meeting skipped without deleting anything', async () => {
    const updateMeeting = vi.fn(async () => {})
    const removeSession = vi.fn(async () => {})
    await skipScheduledMeeting({ meeting: clientMeeting, updateMeeting, removeSession })
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'skipped', session_id: null })
    expect(removeSession).not.toHaveBeenCalled()
  })

  it('does nothing at all without a meeting id', async () => {
    const updateMeeting = vi.fn()
    const removeSession = vi.fn()
    await skipScheduledMeeting({ meeting: {}, updateMeeting, removeSession })
    expect(updateMeeting).not.toHaveBeenCalled()
    expect(removeSession).not.toHaveBeenCalled()
  })

  /* Cancelling next week's meeting, or deleting a confirmed one by mistake,
     had no way back on the phone. The undo puts the session back and the
     exact prior status and link. */
  it('offers an undo that restores the session, status and link', async () => {
    const updateMeeting = vi.fn(async () => {})
    const removeSession = vi.fn(async () => {})
    const putBackSession = vi.fn(async () => {})
    const pushUndo = vi.fn()
    await skipScheduledMeeting({
      meeting: { ...clientMeeting, status: 'confirmed', session_id: 's9' },
      updateMeeting, removeSession, putBackSession, pushUndo, label: 'בוטלה',
    })
    expect(pushUndo).toHaveBeenCalledTimes(1)
    const { label, undo } = pushUndo.mock.calls[0][0]
    expect(label).toBe('בוטלה')
    await undo()
    expect(putBackSession).toHaveBeenCalledWith('s9')
    expect(updateMeeting).toHaveBeenLastCalledWith('m1', { status: 'confirmed', session_id: 's9' })
  })
})

describe('rescheduling a meeting', () => {
  const meeting = { ...clientMeeting, status: 'pending', duration_minutes: 90 }

  /* Not a move of scheduled_at: the generator would refill the old slot. The
     new time is a fresh row, and the original holds its key as skipped. */
  it('inserts the new time first, keeps the length, then skips the original', async () => {
    const calls = []
    const addMeeting = vi.fn(async (row) => { calls.push('add'); return { id: 'new', ...row } })
    const updateMeeting = vi.fn(async () => { calls.push('skip') })
    const created = await rescheduleScheduledMeeting({ meeting, at: '2026-09-10T10:00:00.000Z', addMeeting, updateMeeting })
    expect(calls).toEqual(['add', 'skip'])
    expect(addMeeting).toHaveBeenCalledWith({ subject_type: 'client', subject_id: 'c1', scheduled_at: '2026-09-10T10:00:00.000Z', status: 'pending', duration_minutes: 90 })
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'skipped', session_id: null })
    expect(created.id).toBe('new')
  })

  /* A move onto a slot the subject already holds is rejected by the unique
     index. The original must be left as it was, and the error must reach the
     form so it stays open. */
  it('leaves the original untouched and throws when the new slot is taken', async () => {
    const addMeeting = vi.fn(async () => { throw new Error('duplicate key') })
    const updateMeeting = vi.fn()
    await expect(rescheduleScheduledMeeting({ meeting, at: 'x', addMeeting, updateMeeting })).rejects.toThrow('duplicate key')
    expect(updateMeeting).not.toHaveBeenCalled()
  })

  it('undo removes the new row and puts the original back', async () => {
    const addMeeting = vi.fn(async () => ({ id: 'new' }))
    const updateMeeting = vi.fn(async () => {})
    const removeMeeting = vi.fn(async () => {})
    const pushUndo = vi.fn()
    await rescheduleScheduledMeeting({ meeting, at: 'x', addMeeting, updateMeeting, removeMeeting, pushUndo, label: 'moved' })
    await pushUndo.mock.calls[0][0].undo()
    expect(removeMeeting).toHaveBeenCalledWith('new')
    expect(updateMeeting).toHaveBeenLastCalledWith('m1', { status: 'pending' })
  })
})
