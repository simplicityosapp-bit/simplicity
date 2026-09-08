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
})
