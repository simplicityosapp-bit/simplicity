/* ════════════════════════════════════════════════════════════════
   CALENDAR DUPLICATES — pairs an app scheduled_meeting with a synced
   Google Calendar event that looks like the SAME session, so the user
   can resolve the duplicate by hand.

   A duplicate (per product decision 08/06/2026):
     · the synced event is matched to the SAME subject (client/group)
     · on the SAME calendar day (local time)
     · within ±DUP_WINDOW_MIN minutes of the meeting time

   We never auto-resolve and never touch Google (one-way sync) — the
   caller decides per pair whether to hide the app meeting (status
   'skipped') or the synced event (deleted_at). Pure + deterministic.
   ════════════════════════════════════════════════════════════════ */

export const DUP_WINDOW_MIN = 90

interface Meeting {
  id: string
  status?: string | null
  subject_type?: string
  subject_id?: string
  scheduled_at: string | number | Date
}
interface CalEvent {
  id: string
  deleted_at?: string | null
  start_time?: string | number | Date | null
  client_id?: string | null
  group_id?: string | null
}
interface NamedEntity { id: string; name?: string }
interface FindDuplicatesArgs {
  meetings?: Meeting[]
  calendarEvents?: CalEvent[]
  clients?: NamedEntity[]
  groups?: NamedEntity[]
}
export interface CalendarDuplicate {
  id: string
  meeting: Meeting
  event: CalEvent
  subjectType?: string
  subjectName: string
  when: Date
}

const dayKey = (d: string | number | Date): string => {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
}

/* Stable pair id so a duplicate keeps the same identity across renders
   (used as the React key + to dedupe). */
const pairId = (meetingId: string, eventId: string): string => `${meetingId}::${eventId}`

export function findCalendarDuplicates({ meetings = [], calendarEvents = [], clients = [], groups = [] }: FindDuplicatesArgs = {}): CalendarDuplicate[] {
  const windowMs = DUP_WINDOW_MIN * 60 * 1000

  /* Only live, still-active app meetings can be duplicates — a meeting
     the user already skipped is already resolved. */
  const activeMeetings = meetings.filter((m) => m.status === 'pending' || m.status === 'confirmed')

  /* Index synced, matched events by their subject for a cheap lookup.
     An event counts only if the sync (or a manual assignment) tied it to
     a client or group — we need the subject to call it a duplicate. */
  const eventsBySubject = new Map<string, CalEvent[]>()
  for (const ev of calendarEvents) {
    if (ev.deleted_at) continue
    if (!ev.start_time) continue
    const subjectId = ev.client_id || ev.group_id
    if (!subjectId) continue
    const type = ev.client_id ? 'client' : 'group'
    const key = `${type}|${subjectId}`
    if (!eventsBySubject.has(key)) eventsBySubject.set(key, [])
    eventsBySubject.get(key)!.push(ev)
  }

  const nameOf = (type: string | undefined, id: string | undefined): string => {
    if (type === 'client') return clients.find((c) => c.id === id)?.name || 'לקוח'
    return groups.find((g) => g.id === id)?.name || 'קבוצה'
  }

  const out: CalendarDuplicate[] = []
  const seen = new Set<string>()
  for (const m of activeMeetings) {
    const key = `${m.subject_type}|${m.subject_id}`
    const candidates = eventsBySubject.get(key)
    if (!candidates) continue
    const mAt = new Date(m.scheduled_at)
    for (const ev of candidates) {
      const eAt = new Date(ev.start_time!)
      if (dayKey(eAt) !== dayKey(mAt)) continue
      if (Math.abs(eAt.getTime() - mAt.getTime()) > windowMs) continue
      const id = pairId(m.id, ev.id)
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        meeting: m,
        event: ev,
        subjectType: m.subject_type,
        subjectName: nameOf(m.subject_type, m.subject_id),
        when: mAt,
      })
    }
  }
  /* Soonest first so the user clears the nearest collision first. */
  return out.sort((a, b) => a.when.getTime() - b.when.getTime())
}
