/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS ENGINE — derives the `scheduled_meetings` rows
   that should exist for every client/group with a recurring_day +
   recurring_time, returning the inserts the caller still owes the DB.

   Window is (now − 14 days) → (now + 4 weeks). The lower bound lets
   the home meeting-confirmation widget surface meetings the user
   still hasn't acknowledged. New subjects don't get backfilled past
   their created_at, so signing up doesn't conjure fake prior meetings.
   Idempotent: rows are keyed by (subject_type, subject_id,
   scheduled_at) — existing rows are skipped.
   ════════════════════════════════════════════════════════════════ */

import i18n from '@simplicity/core/i18n'
import { showToast, showError } from './toast'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_WEEKS_AHEAD = 4
const PAST_LOOKBACK_DAYS = 14

function parseHHMM(t) {
  if (!t) return null
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return [hh, mm]
}

function meetingKey(type, id, isoAt) {
  /* Use ms-precision timestamp so different ISO formats (with/without
     fractional seconds) hash the same. */
  return `${type}|${id}|${new Date(isoAt).getTime()}`
}

/* Step to the first date on/after `from` whose day-of-week matches
   `dow`, set to (hh:mm). The `from` date itself counts if it already
   matches both day and time. */
function firstOccurrenceOnOrAfter(from, dow, hh, mm) {
  const d = new Date(from)
  d.setHours(hh, mm, 0, 0)
  /* If we set the time and that's already before `from`, we have to
     advance — even if the day matches, today's meeting has passed
     and "on or after from" means the next one. */
  if (d.getDay() === dow && d >= from) return d
  let safety = 8
  while (safety > 0) {
    d.setDate(d.getDate() + 1)
    d.setHours(hh, mm, 0, 0)
    if (d.getDay() === dow && d >= from) return d
    safety--
  }
  return null
}

export function generateScheduledMeetings(
  clients,
  groups,
  existingMeetings,
  now = new Date(),
  { weeksAhead = DEFAULT_WEEKS_AHEAD, pastLookbackDays = PAST_LOOKBACK_DAYS } = {},
) {
  const out = []
  const existingKeys = new Set(
    (existingMeetings || []).map((m) => meetingKey(m.subject_type, m.subject_id, m.scheduled_at)),
  )

  const clientSubjects = (clients || [])
    .filter((c) => !c.deleted_at)
    .filter((c) => c.recurring_day != null && c.recurring_time)
    .filter((c) => c.status_meta !== 'past' && c.status_meta !== 'no_status')
    .map((c) => ({
      type: 'client',
      id: c.id,
      dow: Number(c.recurring_day),
      time: c.recurring_time,
      createdAt: c.created_at,
    }))

  const groupSubjects = (groups || [])
    .filter((g) => !g.deleted_at)
    .filter((g) => g.recurring_day != null && g.recurring_time)
    .filter((g) => g.status !== 'ended')
    .map((g) => ({
      type: 'group',
      id: g.id,
      dow: Number(g.recurring_day),
      time: g.recurring_time,
      createdAt: g.created_at,
    }))

  const subjects = [...clientSubjects, ...groupSubjects]
  const horizonEnd = new Date(now.getTime() + weeksAhead * 7 * MS_PER_DAY)
  const horizonStart = new Date(now.getTime() - pastLookbackDays * MS_PER_DAY)

  for (const s of subjects) {
    const hhmm = parseHHMM(s.time)
    if (!hhmm) continue
    if (Number.isNaN(s.dow) || s.dow < 0 || s.dow > 6) continue
    const [hh, mm] = hhmm

    /* Don't backfill before the subject existed. */
    const subjectStart = s.createdAt ? new Date(s.createdAt) : horizonStart
    const startFrom = subjectStart > horizonStart ? subjectStart : horizonStart

    let occ = firstOccurrenceOnOrAfter(startFrom, s.dow, hh, mm)
    if (!occ) continue
    while (occ <= horizonEnd) {
      const isoAt = occ.toISOString()
      const k = meetingKey(s.type, s.id, isoAt)
      if (!existingKeys.has(k)) {
        existingKeys.add(k)
        out.push({
          subject_type: s.type,
          subject_id: s.id,
          scheduled_at: isoAt,
          status: 'pending',
          session_id: null,
        })
      }
      /* Step a calendar week, NOT a fixed 7×24h — setDate preserves the local
         wall-clock time so a 10:00 meeting stays 10:00 across DST boundaries
         (a fixed-ms step would drift it to 11:00). Matches recurring.js. */
      occ.setDate(occ.getDate() + 7)
    }
  }
  return out
}

/* Ids of FUTURE pending scheduled meetings that were generated for a subject's
   OLD recurring slot but no longer fit the NEW one — i.e. stale occurrences to
   drop after the recurring day/time changes or is cleared on a client/group.
   Keyed on the OLD slot so genuinely one-off meetings (which never matched the
   recurring slot) are left alone, and PAST pending rows are kept (they may
   still need confirming). schedule = { day: number|string|null, time:
   'HH:MM'|null }; a null/empty schedule matches nothing (so clearing the
   recurring time drops every old-slot future occurrence). */
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

/* Next session number for a meeting's subject — count of the subject's
   existing sessions + 1 (mirrors ClientDrawer / project-detail). */
function nextSessionNum(sessions, m) {
  const owned = m.subject_type === 'group'
    ? (sessions || []).filter((s) => s.group_id === m.subject_id)
    : (sessions || []).filter((s) => s.client_id === m.subject_id)
  return owned.length + 1
}

/* Confirming a scheduled meeting "happened" MATERIALISES a real session and
   links it via scheduled_meetings.session_id — the schema link that was
   designed but never wired, which is why a confirmed meeting never showed up
   in the client/group card or counted toward sessions. Dedup: if a session is
   already linked, just flip the status. Best-effort: if the session insert
   fails, still mark confirmed so the row doesn't get stuck. Shared by the home
   review widget and the calendar event-details flow so both surfaces update
   the card identically. */
export async function confirmScheduledMeeting({ meeting, sessions, addSession, updateMeeting, clients = [] }) {
  try {
    /* Per-session clients bill each meeting through the explicit one-off charge
       prompt (the calendar's billSession), so auto-materialising a session here
       too would double-count. The calendar screen guarded this inline; centralise
       it in the helper so EVERY surface (home review widget, today-tile drill,
       calendar) behaves identically instead of the home surfaces silently
       creating a billable session the calendar deliberately avoids. */
    const subjectClient = meeting.subject_type === 'client'
      ? (clients || []).find((c) => c.id === meeting.subject_id)
      : null
    const perSession = subjectClient?.billing_mode === 'per_session'
    if (meeting.session_id || perSession) {
      await updateMeeting(meeting.id, { status: 'confirmed' })
    } else {
      const isGroup = meeting.subject_type === 'group'
      let session = null
      /* Best-effort: if the session insert fails we still mark the meeting
         confirmed (just without a link) — only a failure of that final write
         is a real failure worth surfacing. */
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
    showToast(i18n.t('calendar:toast.meetingConfirmed'))
  } catch {
    showError(i18n.t('calendar:toast.actionFailed'))
  }
}

/* Log the one-off held session that BILLS a per-session client for a confirmed
   meeting — mirrors the calendar's billSession (clientBalance accrues held ×
   price_per_session). Offered as an explicit "charge?" step AFTER confirming,
   so per-session clients are billed the same way on the home surfaces and the
   calendar. The session is intentionally unlinked from the meeting (like the
   calendar), a standalone charge. */
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

/* Didn't happen: mark skipped and drop any session we materialised for it
   (clearing the link). Linked-expense handling stays with the caller. */
export async function skipScheduledMeeting({ meeting, updateMeeting, removeSession }) {
  try {
    await updateMeeting(meeting.id, { status: 'skipped', session_id: null })
    if (meeting.session_id) removeSession(meeting.session_id)
    showToast(i18n.t('calendar:toast.meetingSkipped'))
  } catch {
    showError(i18n.t('calendar:toast.actionFailed'))
  }
}

/* Visible-in-widget filter: a meeting that's already in the past, no
   older than 14 days, and still pending. Sorted oldest-first so the
   user clears them in chronological order. */
export function pendingMeetingsToReview(meetings, now = new Date()) {
  const cutoff = new Date(now.getTime() - PAST_LOOKBACK_DAYS * MS_PER_DAY)
  return (meetings || [])
    .filter((m) => m.status === 'pending')
    .filter((m) => {
      const at = new Date(m.scheduled_at)
      return at <= now && at >= cutoff
    })
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
}
