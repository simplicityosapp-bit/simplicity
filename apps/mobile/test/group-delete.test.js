/* ════════════════════════════════════════════════════════════════
   DELETING A GROUP — the choices, and the one undo that reverses them
   ════════════════════════════════════════════════════════════════
   The phone used to soft-delete the group row alone. Pinned here:
     · the counts cover the roster union (rows + the legacy tag), pending
       meetings only, and group-linked reminders;
     · kept members are released from the tag; deleted ones are removed;
     · the defaults delete future meetings and keep history;
     · undo restores every row and re-inserts the hard-deleted meetings,
       and a redo after it removes the re-inserted ones.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi } from 'vitest'
import { groupDeleteCounts, deleteGroupCascade, groupMemberClients } from '../src/lib/groupDelete'

const group = { id: 'g1', name: 'בוקר' }
const data = {
  clients: [
    { id: 'c1', group_id: 'g1' },
    { id: 'c2', group_id: 'g2' },
    { id: 'c3', group_id: 'g1', deleted_at: '2026-01-01' },
  ],
  members: [
    { id: 'm1', client_id: 'c1', group_id: 'g1' },
    { id: 'm2', client_id: 'c2', group_id: 'g1' },
    { id: 'm3', client_id: 'c2', group_id: 'g1', left_at: '2026-01-01' },
  ],
  sessions: [{ id: 's1', group_id: 'g1' }, { id: 's2', group_id: 'g9' }],
  reminders: [{ id: 'r1', linked_to_type: 'group', linked_to_id: 'g1' }],
  meetings: [
    { id: 'x1', subject_type: 'group', subject_id: 'g1', status: 'pending', scheduled_at: '2099-01-01T09:00:00Z', user_id: 'u' },
    { id: 'x2', subject_type: 'group', subject_id: 'g1', status: 'confirmed' },
  ],
}
const makeOps = () => {
  const log = []
  const op = (name) => vi.fn(async (...args) => { log.push([name, ...args]); return name === 'insertMeeting' ? { id: `new-${args[0].id}` } : undefined })
  const names = ['removeClient', 'restoreClient', 'updateClient', 'removeMember', 'restoreMember', 'removeSession', 'restoreSession', 'removeReminder', 'restoreReminder', 'removeMeeting', 'insertMeeting', 'removeGroup', 'restoreGroup', 'refresh']
  return { log, ops: Object.fromEntries(names.map((n) => [n, op(n)])) }
}

describe('counts', () => {
  it('counts the roster union, pending meetings and linked reminders', () => {
    expect(groupMemberClients('g1', data).map((c) => c.id).sort()).toEqual(['c1', 'c2'])
    expect(groupDeleteCounts(group, data)).toEqual({ members: 2, futureMeetings: 1, pastSessions: 1, reminders: 1 })
  })
})

describe('the cascade', () => {
  it('with the defaults: releases tags, drops rows and future meetings, keeps history', async () => {
    const { ops, log } = makeOps()
    const res = await deleteGroupCascade({ group, choices: {}, data, ops })
    expect(ops.updateClient).toHaveBeenCalledWith('c1', { group_id: null })
    expect(ops.removeClient).not.toHaveBeenCalled()
    expect(res.memberRowIds).toEqual(['m1', 'm2'])
    expect(ops.removeMeeting).toHaveBeenCalledWith('x1')
    expect(ops.removeSession).not.toHaveBeenCalled()
    expect(ops.removeReminder).not.toHaveBeenCalled()
    expect(log.at(-1)).toEqual(['removeGroup', 'g1'])
  })

  it('deletes the clients and history when asked to', async () => {
    const { ops } = makeOps()
    await deleteGroupCascade({ group, choices: { keepMembers: false, keepPastSessions: false, keepReminders: false, keepFutureMeetings: true }, data, ops })
    expect(ops.removeClient.mock.calls.map((c) => c[0]).sort()).toEqual(['c1', 'c2'])
    expect(ops.removeSession).toHaveBeenCalledWith('s1')
    expect(ops.removeReminder).toHaveBeenCalledWith('r1')
    expect(ops.removeMeeting).not.toHaveBeenCalled()
  })

  it('one undo puts it all back, meetings re-inserted; redo removes the re-inserted ones', async () => {
    const { ops } = makeOps()
    const pushUndo = vi.fn()
    await deleteGroupCascade({ group, choices: {}, data, ops, pushUndo, label: 'deleted' })
    const { undo, redo } = pushUndo.mock.calls[0][0]
    await undo()
    expect(ops.restoreGroup).toHaveBeenCalledWith('g1')
    expect(ops.updateClient).toHaveBeenLastCalledWith('c1', { group_id: 'g1' })
    expect(ops.restoreMember.mock.calls.map((c) => c[0])).toEqual(['m1', 'm2'])
    expect(ops.insertMeeting).toHaveBeenCalledWith(data.meetings[0])
    ops.removeMeeting.mockClear()
    await redo()
    expect(ops.removeMeeting).toHaveBeenCalledWith('new-x1')
  })

  it('a failed step does not strand the rest', async () => {
    const { ops } = makeOps()
    ops.removeMember.mockImplementation(async () => { throw new Error('offline') })
    await deleteGroupCascade({ group, choices: {}, data, ops })
    expect(ops.removeGroup).toHaveBeenCalledWith('g1')
  })
})
