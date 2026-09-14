// Scheduled-meeting confirm / skip — the session-materialisation half of web's
// lib/scheduledMeetings.js, ported so mobile matches web: confirming a past
// pending meeting MATERIALISES a real session and links it via
// scheduled_meetings.session_id, so the meeting counts toward the client/group
// card + session count (a bare status flip never did). Framework-agnostic:
// the caller injects addSession / updateMeeting / removeSession (+ sessions for
// numbering). No toast here — the hook's optimistic update + reload-on-error
// surfaces failure.

// IDs of a subject's FUTURE PENDING meetings that matched the OLD weekly slot
// but not the NEW one — the stale occurrences to purge when a recurring slot
// changes. This was a verbatim PORT of the web copy, which meant it also
// inherited the web copy's bug: it read the slot with getDay/getHours, i.e. in
// the device's own zone, so on a phone outside Israel a 19:45 meeting looked
// like a 16:45 one and the purge either spared or dropped the wrong rows.
// A phone is far likelier than a browser to be in another zone.
//
// Now the single implementation in @simplicity/core, the same one the web app
// and the nightly cron run, computed against an explicit time zone.
export { staleScheduledMeetingIds } from '@simplicity/core'

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
//
// A per-session client is the exception, as on web: every session they have is
// billed, so the confirmation itself creates none, and the caller asks whether
// to charge (billPerSessionMeeting). The calendar guarded this inline while the
// home tile did not, so a coach who confirmed from home was charged without
// being asked. Pass `clients` so the guard can see the billing mode.
export async function confirmScheduledMeeting({ meeting, sessions, addSession, updateMeeting, clients = [] }) {
  if (!meeting?.id) return
  const subjectClient = meeting.subject_type === 'client'
    ? (clients || []).find((c) => c.id === meeting.subject_id)
    : null
  if (meeting.session_id || subjectClient?.billing_mode === 'per_session') {
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

// The one-off held session that BILLS a per-session client for a confirmed
// meeting (mirrors web billPerSessionMeeting and the calendar's billSession).
// Deliberately unlinked from the meeting: it is a charge, not the meeting's
// record. Numbered after the client's live sessions.
export async function billPerSessionMeeting({ meeting, sessions, addSession }) {
  const num = (sessions || []).filter((s) => !s.deleted_at && s.client_id === meeting.subject_id).length + 1
  return addSession({
    date: meeting.scheduled_at,
    summary: null,
    notes: null,
    client_id: meeting.subject_id,
    group_id: null,
    subject_type: 'client',
    subject_id: meeting.subject_id,
    num,
  })
}

// Didn't happen: mark skipped and drop any session we materialised for it
// (clearing the link). Linked-expense handling stays with the caller.
export async function skipScheduledMeeting({ meeting, updateMeeting, removeSession }) {
  if (!meeting?.id) return
  await updateMeeting(meeting.id, { status: 'skipped', session_id: null })
  if (meeting.session_id && removeSession) await removeSession(meeting.session_id)
}
