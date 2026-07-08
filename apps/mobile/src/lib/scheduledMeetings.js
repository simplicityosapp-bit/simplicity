// Scheduled-meeting confirm / skip — the session-materialisation half of web's
// lib/scheduledMeetings.js, ported so mobile matches web: confirming a past
// pending meeting MATERIALISES a real session and links it via
// scheduled_meetings.session_id, so the meeting counts toward the client/group
// card + session count (a bare status flip never did). Framework-agnostic:
// the caller injects addSession / updateMeeting / removeSession (+ sessions for
// numbering). No toast here — the hook's optimistic update + reload-on-error
// surfaces failure.

// Next session number for a meeting's subject — count of the subject's existing
// sessions + 1 (mirrors ClientDrawer nextNum / web nextSessionNum).
export function nextSessionNum(sessions, m) {
  const owned = m.subject_type === 'group'
    ? (sessions || []).filter((s) => s.group_id === m.subject_id)
    : (sessions || []).filter((s) => s.client_id === m.subject_id)
  return owned.length + 1
}

// Confirm "it happened": materialise a session + link session_id. Dedup: if a
// session is already linked, just flip the status. Best-effort — if the session
// insert fails, still mark confirmed so the row isn't stuck (matches web).
export async function confirmScheduledMeeting({ meeting, sessions, addSession, updateMeeting }) {
  if (!meeting?.id) return
  if (meeting.session_id) {
    await updateMeeting(meeting.id, { status: 'confirmed' })
    return
  }
  const isGroup = meeting.subject_type === 'group'
  let session = null
  try {
    session = await addSession({
      date: meeting.scheduled_at,
      summary: null,
      notes: null,
      client_id: isGroup ? null : meeting.subject_id,
      group_id: isGroup ? meeting.subject_id : null,
      subject_type: meeting.subject_type,
      subject_id: meeting.subject_id,
      num: nextSessionNum(sessions, meeting),
    })
  } catch { /* session insert failed — fall through to mark confirmed */ }
  await updateMeeting(meeting.id, session ? { status: 'confirmed', session_id: session.id } : { status: 'confirmed' })
}

// Didn't happen: mark skipped and drop any session we materialised for it
// (clearing the link). Linked-expense handling stays with the caller.
export async function skipScheduledMeeting({ meeting, updateMeeting, removeSession }) {
  if (!meeting?.id) return
  await updateMeeting(meeting.id, { status: 'skipped', session_id: null })
  if (meeting.session_id && removeSession) await removeSession(meeting.session_id)
}
