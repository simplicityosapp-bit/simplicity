/* ════════════════════════════════════════════════════════════════
   DELETING A GROUP — what happens to everything hanging off it.
   ════════════════════════════════════════════════════════════════
   Port of web project-detail's deleteGroupCounts / runDeleteGroup. The
   phone's delete was one confirmation that soft-deleted the group row and
   nothing else: members kept a group tag and membership rows pointing at a
   group in the trash, and its future meetings stayed on the calendar.

   Four choices, offered only where there is something to choose about:
     members          keep (release the tag)  / delete the clients
     future meetings  keep / delete (default — the recurring rule is gone)
     past sessions    keep (default — history) / delete
     reminders        keep (default) / delete

   Everything is snapshotted before the first write, so one undo reverses the
   whole cascade — including the future meetings, which are hard-deleted and
   come back re-inserted (a Trash restore of the group alone never could).
   Writes are injected; each step is best-effort so one failure does not
   strand the rest half-applied.
   ════════════════════════════════════════════════════════════════ */

const live = (rows) => (rows || []).filter((r) => !r.deleted_at)

export const DELETE_GROUP_DEFAULTS = { keepMembers: true, keepFutureMeetings: false, keepPastSessions: true, keepReminders: true }

/* A group's people: its live membership rows, plus a client carrying only the
   legacy single-group tag — the same union the roster reads. */
export function groupMemberClients(groupId, { members, clients }) {
  const ids = new Set()
  live(members).forEach((m) => { if (m.group_id === groupId && !m.left_at) ids.add(m.client_id) })
  live(clients).forEach((c) => { if (c.group_id === groupId) ids.add(c.id) })
  return [...ids].map((id) => (clients || []).find((c) => c.id === id)).filter(Boolean)
}

const futureMeetingsOf = (groupId, meetings) => (meetings || []).filter((m) => m.subject_type === 'group' && m.subject_id === groupId && m.status === 'pending')
const sessionsOf = (groupId, sessions) => live(sessions).filter((s) => s.group_id === groupId)
const remindersOf = (groupId, reminders) => live(reminders).filter((r) => r.linked_to_type === 'group' && r.linked_to_id === groupId)

export function groupDeleteCounts(group, data) {
  return {
    members: groupMemberClients(group.id, data).length,
    futureMeetings: futureMeetingsOf(group.id, data.meetings).length,
    pastSessions: sessionsOf(group.id, data.sessions).length,
    reminders: remindersOf(group.id, data.reminders).length,
  }
}

const quietly = (p) => Promise.resolve(p).catch(() => {})

export async function deleteGroupCascade({ group, choices, data, ops, pushUndo, label }) {
  const c = { ...DELETE_GROUP_DEFAULTS, ...(choices || {}) }
  const memberClients = groupMemberClients(group.id, data)
  const memberRowIds = live(data.members).filter((m) => m.group_id === group.id && !m.left_at).map((m) => m.id)
  const sessionIds = c.keepPastSessions ? [] : sessionsOf(group.id, data.sessions).map((s) => s.id)
  const reminderIds = c.keepReminders ? [] : remindersOf(group.id, data.reminders).map((r) => r.id)
  const futureMeetings = c.keepFutureMeetings ? [] : futureMeetingsOf(group.id, data.meetings)
  const deletedClientIds = []
  const releasedClientIds = []

  for (const cl of memberClients) {
    if (!c.keepMembers) {
      await quietly(ops.removeClient(cl.id))
      deletedClientIds.push(cl.id)
    } else if (cl.group_id === group.id) {
      // Kept: the client falls back to a private client of the project.
      await quietly(ops.updateClient(cl.id, { group_id: null }))
      releasedClientIds.push(cl.id)
    }
  }
  for (const id of memberRowIds) await quietly(ops.removeMember(id))
  for (const id of sessionIds) await quietly(ops.removeSession(id))
  for (const id of reminderIds) await quietly(ops.removeReminder(id))
  for (const m of futureMeetings) await quietly(ops.removeMeeting(m.id))
  await ops.removeGroup(group.id)

  /* Meetings come back with fresh ids; a redo after an undo has to delete
     those, not the originals. */
  let reMeetingIds = []
  pushUndo?.({
    label,
    undo: async () => {
      await quietly(ops.restoreGroup(group.id))
      for (const id of deletedClientIds) await quietly(ops.restoreClient(id))
      for (const id of releasedClientIds) await quietly(ops.updateClient(id, { group_id: group.id }))
      for (const id of memberRowIds) await quietly(ops.restoreMember(id))
      for (const id of sessionIds) await quietly(ops.restoreSession(id))
      for (const id of reminderIds) await quietly(ops.restoreReminder(id))
      reMeetingIds = []
      for (const m of futureMeetings) {
        try { const row = await ops.insertMeeting(m); if (row?.id) reMeetingIds.push(row.id) } catch { /* keep going */ }
      }
      ops.refresh?.()
    },
    redo: async () => {
      for (const id of releasedClientIds) await quietly(ops.updateClient(id, { group_id: null }))
      for (const id of deletedClientIds) await quietly(ops.removeClient(id))
      for (const id of memberRowIds) await quietly(ops.removeMember(id))
      for (const id of sessionIds) await quietly(ops.removeSession(id))
      for (const id of reminderIds) await quietly(ops.removeReminder(id))
      for (const id of (reMeetingIds.length ? reMeetingIds : futureMeetings.map((m) => m.id))) await quietly(ops.removeMeeting(id))
      await quietly(ops.removeGroup(group.id))
      ops.refresh?.()
    },
  })
  return { deletedClientIds, releasedClientIds, memberRowIds, sessionIds, reminderIds, meetingIds: futureMeetings.map((m) => m.id) }
}
