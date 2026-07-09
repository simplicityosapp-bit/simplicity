// Scheduled-meeting confirm / skip — the session-materialisation half of web's
// lib/scheduledMeetings.js, ported so mobile matches web: confirming a past
// pending meeting MATERIALISES a real session and links it via
// scheduled_meetings.session_id, so the meeting counts toward the client/group
// card + session count (a bare status flip never did). Framework-agnostic:
// the caller injects addSession / updateMeeting / removeSession (+ sessions for
// numbering). No toast here — the hook's optimistic update + reload-on-error
// surfaces failure.

// Parse "HH:MM" → [hh, mm] (ported verbatim from web lib/scheduledMeetings.js).
function parseHHMM(t) {
  if (!t) return null
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return [hh, mm]
}

// IDs of a subject's FUTURE PENDING meetings that matched the OLD weekly slot
// but not the NEW one — the stale occurrences to purge when a client's recurring
// slot changes (ported verbatim from web). Past/confirmed meetings are left
// alone. `now` is injected so callers stay testable.
export function staleScheduledMeetingIds(subjectType, subjectId, oldSchedule, newSchedule, meetings, now = new Date()) {
  const matchesSlot = (m, sched) => {
    const day = sched?.day
    if (day == null || day === '') return false
    const hhmm = parseHHMM(sched.time)
    if (!hhmm) return false
    const d = new Date(m.scheduled_at)
    return d.getDay() === Number(day) && d.getHours() === hhmm[0] && d.getMinutes() === hhmm[1]
  }
  return (meetings || [])
    .filter((m) => m.subject_type === subjectType && m.subject_id === subjectId)
    .filter((m) => m.status === 'pending')
    .filter((m) => new Date(m.scheduled_at) > now)
    .filter((m) => matchesSlot(m, oldSchedule) && !matchesSlot(m, newSchedule))
    .map((m) => m.id)
}

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
