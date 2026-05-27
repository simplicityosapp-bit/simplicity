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
      occ = new Date(occ.getTime() + 7 * MS_PER_DAY)
    }
  }
  return out
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
