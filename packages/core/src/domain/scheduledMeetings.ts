/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS ENGINE — the recurring-meeting rules, shared by
   the browser and the server.
   ════════════════════════════════════════════════════════════════

   WHY THIS FILE IMPORTS NOTHING
   -----------------------------
   The nightly cron runs this same code inside a Supabase Edge Function
   (Deno). Deno resolves relative imports strictly — it needs the file
   extension — while the rest of packages/core is written extensionless
   ('./dates'), and domain/dates.ts additionally reaches into ../i18n.
   A deploy that imports any of that fails to bundle:

     Module not found ".../packages/core/src/i18n"
       at packages/core/src/domain/dates.ts:5

   So the engine, and the two helpers it needs, live here with ZERO
   imports. `dates.ts` and `clients.ts` re-export from this file rather
   than the other way round, so every rule still has exactly one
   definition — the dependency just points inward. Keep it that way:
   adding an import here silently breaks the cron's deploy.

   WHY THE TIME ZONE IS EXPLICIT
   -----------------------------
   The engine used to build occurrences with setHours/getDay, i.e. in
   whatever zone the runtime happened to be in. That is fine in a
   coach's browser and wrong everywhere else: the Edge runtime is
   pinned to UTC and refuses TZ changes (`Deno.env.set('TZ')` throws
   NotSupported), so a 09:30 slot would have been written as 09:30Z —
   12:30 in Israel. Every occurrence is now computed against an
   explicit IANA zone, defaulting to Israel, so the same slot lands on
   the same wall-clock minute no matter who runs the engine.
   ════════════════════════════════════════════════════════════════ */

export type MeetingDateInput = string | number | Date

export const DEFAULT_TIME_ZONE = 'Asia/Jerusalem'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_WEEKS_AHEAD = 4
const PAST_LOOKBACK_DAYS = 14

/* ── Date-only parsing ──────────────────────────────────────────
   A bare 'YYYY-MM-DD' is parsed by `new Date()` as UTC midnight, so
   reading it back with local getters rolls the day backwards west of
   UTC. A date-only string denotes a calendar day, not an instant, so
   it is parsed as LOCAL midnight instead. (Re-exported by dates.ts —
   this is the single definition.) */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
export function toLocalDate(value: MeetingDateInput): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value as string | number)
}

/* ── Zoned wall-clock helpers ───────────────────────────────────
   Intl is the only timezone database available in both a browser and
   Deno, so the offset is read back out of a formatted date rather
   than assumed. DST is handled by construction: the offset is looked
   up AT the instant in question, never taken as a constant. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function partsOf(instant: Date, timeZone: string): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out: Record<string, string> = {}
  for (const p of dtf.formatToParts(instant)) out[p.type] = p.value
  return out
}

/* Offset of `timeZone` from UTC, in ms, at this exact instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = partsOf(instant, timeZone)
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  )
  /* Drop the instant's own milliseconds — the formatted parts carry none,
     and leaving them in would smear the offset by up to 999ms. */
  return asUTC - (instant.getTime() - instant.getMilliseconds())
}

/* The calendar date + weekday an instant falls on, in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): {
  year: number; month0: number; day: number; weekday: number
} {
  const p = partsOf(instant, timeZone)
  return {
    year: Number(p.year),
    month0: Number(p.month) - 1,
    day: Number(p.day),
    weekday: Math.max(0, WEEKDAYS.indexOf(p.weekday)),
  }
}

/* The instant at which `timeZone` reads y-m0-d hh:mm.
   Two passes: guess with the offset at the naive UTC reading, then
   re-check the offset at the corrected instant. They differ only
   across a DST boundary, and the second reading is the true one. */
export function zonedTimeToInstant(
  year: number, month0: number, day: number, hh: number, mm: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const guess = Date.UTC(year, month0, day, hh, mm, 0, 0)
  const first = zoneOffsetMs(new Date(guess), timeZone)
  let ts = guess - first
  const second = zoneOffsetMs(new Date(ts), timeZone)
  if (second !== first) ts = guess - second
  return new Date(ts)
}

/* ── Client status rule ─────────────────────────────────────────
   Lives here (rather than in clients.ts) only because the engine
   needs it and this file may not import. clients.ts re-exports it, so
   there is still one definition. */

export interface MeetingClient {
  id: string
  status_meta?: string
  status?: string
  status_overridden?: boolean
  deleted_at?: string | null
  created_at?: string | null
  recurring_day?: number | string | null
  recurring_time?: string | null
  recurring_start_date?: string | null
  recurring_end_date?: string | null
}
export interface MeetingGroup {
  id: string
  status?: string
  deleted_at?: string | null
  created_at?: string | null
  recurring_day?: number | string | null
  recurring_time?: string | null
  recurring_start_date?: string | null
  recurring_end_date?: string | null
}
export interface MeetingMembership {
  client_id?: string
  group_id?: string
  left_at?: string | null
  deleted_at?: string | null
}
export interface ExistingMeeting {
  subject_type?: string
  subject_id?: string
  scheduled_at?: MeetingDateInput
}
export interface DueMeeting {
  subject_type: string
  subject_id: string
  scheduled_at: string
  status: 'pending'
  session_id: null
}

export const statusMetaOf = (c: MeetingClient): string => c.status_meta || c.status || 'no_status'

/* Generic in the row type so callers that carry extra columns (clients.ts
   reads the billing overrides off the membership) keep them through the
   filter instead of being narrowed to this file's minimal shape. */
export function getClientMemberships<T extends MeetingMembership>(
  clientId: string, membersData: T[] = [],
): T[] {
  return (membersData || []).filter((m) => !m.deleted_at && m.client_id === clientId && !m.left_at)
}

/* True when the coach has taken manual control of this client's status
   (migration 0062). When set, the stored status_meta wins over whatever
   the client's groups would otherwise dictate. */
export const isStatusOverridden = (c: MeetingClient | null | undefined): boolean => !!c?.status_overridden

/* A client who belongs to one or more groups derives their status from
   those groups. "Active wins over ended": if ANY of their groups is not
   ended → 'active'; if they only sit in ended groups → 'past'. A client
   with no membership — or one manually overridden — keeps their own
   stored status_meta. */
export function effectiveClientMeta(
  c: MeetingClient | null | undefined,
  membersData: MeetingMembership[] = [],
  groupsData: MeetingGroup[] = [],
): string {
  if (!c) return 'no_status'
  if (isStatusOverridden(c)) return statusMetaOf(c)
  const memberships = getClientMemberships(c.id, membersData)
  if (!memberships.length) return statusMetaOf(c)
  const statuses = memberships
    .map((m) => (groupsData || []).find((g) => g.id === m.group_id))
    .filter((g): g is MeetingGroup => Boolean(g))
    .map((g) => g.status)
  if (!statuses.length) return statusMetaOf(c)
  return statuses.some((s) => s !== 'ended') ? 'active' : 'past'
}

/* ── The engine ─────────────────────────────────────────────────

   Derives the `scheduled_meetings` rows that should exist for every
   client/group carrying a recurring_day + recurring_time, and returns
   only the ones the DB is still missing.

   Window is (now − 14 days) → (now + 4 weeks), further clamped to the
   subject's OWN recurring_start_date / recurring_end_date when set —
   those columns are on both clients and groups and every add/edit form
   collects them, so they are the series' real first and last day. The
   lower bound lets the home meeting-confirmation widget surface
   meetings the user hasn't acknowledged yet; subjects are never
   backfilled past their created_at, so signing up doesn't conjure fake
   prior meetings. Idempotent: rows are keyed by (subject_type,
   subject_id, scheduled_at) and existing ones are skipped. */

interface Subject {
  type: string
  id: string
  dow: number
  time: string
  createdAt?: string | null
  seriesStart?: string | null
  seriesEnd?: string | null
}

function parseHHMM(t: string | null | undefined): [number, number] | null {
  if (!t) return null
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return [hh, mm]
}

/* ms-precision key so different ISO spellings of the same instant
   (with/without fractional seconds) hash identically. */
function meetingKey(type: string | undefined, id: string | undefined, at: MeetingDateInput): string {
  return `${type}|${id}|${new Date(at as string).getTime()}`
}

export interface SlotSchedule {
  day?: number | string | null
  time?: string | null
}
export interface StaleMeetingRow {
  id?: string
  subject_type?: string
  subject_id?: string
  status?: string
  scheduled_at?: MeetingDateInput
}

/* Ids of FUTURE pending meetings that were generated for a subject's OLD
   recurring slot but no longer fit the NEW one — the stale occurrences to drop
   after a recurring day/time changes or is cleared. Keyed on the OLD slot, so
   genuinely one-off meetings (which never matched it) are left alone, and PAST
   pending rows are kept: they may still need confirming. A null/empty schedule
   matches nothing, so clearing the recurring time drops every old-slot future
   occurrence.

   Lives beside the generator, and asks its question the same way: "does this
   instant fall on that slot?" is decided by rebuilding the slot's instant in
   the coach's zone and comparing, rather than by reading the runtime's clock.
   The two used to disagree the moment the runtime wasn't in Israel. */
export function staleScheduledMeetingIds(
  subjectType: string,
  subjectId: string,
  oldSchedule: SlotSchedule | null | undefined,
  newSchedule: SlotSchedule | null | undefined,
  meetings: StaleMeetingRow[] | null | undefined,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): string[] {
  const matchesSlot = (at: Date, sched: SlotSchedule | null | undefined): boolean => {
    const day = sched?.day
    if (day == null || day === '') return false
    const hhmm = parseHHMM(sched?.time)
    if (!hhmm) return false
    const p = zonedParts(at, timeZone)
    if (p.weekday !== Number(day)) return false
    return zonedTimeToInstant(p.year, p.month0, p.day, hhmm[0], hhmm[1], timeZone).getTime() === at.getTime()
  }
  return (meetings || [])
    .filter((m) => m.subject_type === subjectType && m.subject_id === subjectId)
    .filter((m) => m.status === 'pending')
    .filter((m) => new Date(m.scheduled_at as string) > now)
    .filter((m) => {
      const at = new Date(m.scheduled_at as string)
      return matchesSlot(at, oldSchedule) && !matchesSlot(at, newSchedule)
    })
    .map((m) => m.id as string)
}

export function generateScheduledMeetings(
  clients: MeetingClient[] | null | undefined,
  groups: MeetingGroup[] | null | undefined,
  existingMeetings: ExistingMeeting[] | null | undefined,
  now: Date = new Date(),
  {
    weeksAhead = DEFAULT_WEEKS_AHEAD,
    pastLookbackDays = PAST_LOOKBACK_DAYS,
    members = [] as MeetingMembership[],
    timeZone = DEFAULT_TIME_ZONE,
  } = {},
): DueMeeting[] {
  const out: DueMeeting[] = []
  const existingKeys = new Set(
    (existingMeetings || []).map((m) => meetingKey(m.subject_type, m.subject_id, m.scheduled_at as MeetingDateInput)),
  )

  const clientSubjects: Subject[] = (clients || [])
    .filter((c) => !c.deleted_at)
    .filter((c) => c.recurring_day != null && c.recurring_time)
    /* Status MUST come from effectiveClientMeta, never the raw status_meta
       column: for a group-driven client the column keeps whatever it last
       held while the app reads them as 'past' once all their groups end. */
    .filter((c) => {
      const meta = effectiveClientMeta(c, members, groups || [])
      return meta !== 'past' && meta !== 'no_status'
    })
    .map((c) => ({
      type: 'client',
      id: c.id,
      dow: Number(c.recurring_day),
      time: c.recurring_time as string,
      createdAt: c.created_at,
      seriesStart: c.recurring_start_date,
      seriesEnd: c.recurring_end_date,
    }))

  const groupSubjects: Subject[] = (groups || [])
    .filter((g) => !g.deleted_at)
    .filter((g) => g.recurring_day != null && g.recurring_time)
    .filter((g) => g.status !== 'ended')
    .map((g) => ({
      type: 'group',
      id: g.id,
      dow: Number(g.recurring_day),
      time: g.recurring_time as string,
      createdAt: g.created_at,
      seriesStart: g.recurring_start_date,
      seriesEnd: g.recurring_end_date,
    }))

  const horizonEnd = new Date(now.getTime() + weeksAhead * 7 * MS_PER_DAY)
  const horizonStart = new Date(now.getTime() - pastLookbackDays * MS_PER_DAY)

  for (const s of [...clientSubjects, ...groupSubjects]) {
    const hhmm = parseHHMM(s.time)
    if (!hhmm) continue
    if (Number.isNaN(s.dow) || s.dow < 0 || s.dow > 6) continue
    const [hh, mm] = hhmm

    /* Don't backfill before the subject existed… */
    const subjectStart = s.createdAt ? new Date(s.createdAt) : horizonStart
    let startFrom = subjectStart > horizonStart ? subjectStart : horizonStart
    /* …and don't start before the SERIES does. Date-only columns, so the
       bound is the START of that day in the coach's zone. */
    if (s.seriesStart) {
      const p = toLocalDate(s.seriesStart)
      const seriesFrom = zonedTimeToInstant(p.getFullYear(), p.getMonth(), p.getDate(), 0, 0, timeZone)
      if (seriesFrom > startFrom) startFrom = seriesFrom
    }
    /* The series' own last day ends the run, whatever the horizon says —
       taken to the END of that day so a meeting ON the closing date counts. */
    let stopAt = horizonEnd
    if (s.seriesEnd) {
      const p = toLocalDate(s.seriesEnd)
      const seriesTo = new Date(
        zonedTimeToInstant(p.getFullYear(), p.getMonth(), p.getDate() + 1, 0, 0, timeZone).getTime() - 1,
      )
      if (seriesTo < stopAt) stopAt = seriesTo
    }
    if (startFrom > stopAt) continue

    /* Walk to the first occurrence on/after startFrom: step a calendar day
       at a time in the coach's zone until the weekday matches and the
       instant has caught up. Bounded at 8 days — any weekday is reachable
       within a week, so more than that means the data is malformed. */
    let cursor = zonedParts(startFrom, timeZone)
    let occ: Date | null = null
    for (let guard = 0; guard <= 8; guard++) {
      const candidate = zonedTimeToInstant(cursor.year, cursor.month0, cursor.day, hh, mm, timeZone)
      if (cursor.weekday === s.dow && candidate >= startFrom) { occ = candidate; break }
      /* Advance by a CALENDAR day, not by 24h. Adding 86,400,000ms to a slot
         that sits close to midnight lands back on the same date across a DST
         change (a 00:15 slot walked over an autumn fall-back reads 23:15 the
         same day), the cursor stops moving, and the search runs out its guard
         without finding the weekday. Noon is never inside a transition. */
      cursor = zonedParts(zonedTimeToInstant(cursor.year, cursor.month0, cursor.day + 1, 12, 0, timeZone), timeZone)
    }
    if (!occ) continue

    while (occ <= stopAt) {
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
      /* Step a calendar week in the COACH'S zone, not a fixed 7×24h: the
         wall-clock minute is what repeats, so a 10:00 meeting stays 10:00
         across a DST boundary instead of drifting to 09:00 or 11:00. */
      const p = zonedParts(occ, timeZone)
      occ = zonedTimeToInstant(p.year, p.month0, p.day + 7, hh, mm, timeZone)
    }
  }
  return out
}
