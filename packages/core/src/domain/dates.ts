/* ════════════════════════════════════════════════════════════════
   DATE HELPERS — light formatters for home widgets (locale-aware, 24h).
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'
import { hebrewParts, fmtDayLabel, lastDayOf, type DateInput, type SpanningEvent } from './calendar'

const pad = (n: number): string => String(n).padStart(2, '0')

/* A bare 'YYYY-MM-DD' is parsed by `new Date()` as UTC midnight (ECMA-262
   treats a date-only ISO form as UTC). Every formatter below then reads it
   back with the LOCAL getters, so west of UTC the day rolls backwards: a
   birth date of 2026-07-20 renders as 19/07 in New York, and a transaction
   lands on the previous day.
   A date-only string denotes a calendar day, not an instant, so it is parsed
   as LOCAL midnight instead. Strings that carry a time or a zone are left to
   the platform parser, unchanged — they ARE instants and already round-trip
   correctly.
   Note this is a no-op in Israel (UTC+2/+3), where UTC midnight already falls
   on the same local day: the current user base sees no change.
   Exported because the same trap bites anyone bucketing a `date` column into
   days or months (domain/finance, the finance screen) — not just formatters.

   The implementation lives in ./scheduledMeetings — the one file in this
   package that imports nothing, because the meetings engine needs it and the
   nightly cron bundles that file into a Deno edge function. One definition,
   re-exported here so every existing `from './dates'` keeps working. */
export { toLocalDate } from './scheduledMeetings'
import { toLocalDate } from './scheduledMeetings'

/* Date/time format preference — set once from PrefsApplier (mirrors how
   lib/finance receives the currency). Every formatter below reads these,
   so the "תשלומים ומטבע" date/time settings drive the whole app. */
let dateFmt = 'DD/MM/YY'   /* DD/MM/YY | MM/DD/YY | YYYY-MM-DD */
let timeFmt = '24h'        /* 24h | 12h */
export function setDateTimeFormat({ date_format, time_format }: { date_format?: string; time_format?: string } = {}): void {
  if (date_format) dateFmt = date_format
  if (time_format) timeFmt = time_format
}

/* Hebrew-calendar display flag — set from PrefsApplier (Settings →
   Appearance). Only the agenda-style formatWhen() honours it; the broad
   fmtShortDate stays Gregorian so finance / records / exports are
   unaffected. `dual` appends the Gregorian date alongside the Hebrew. */
let hebrewCal = false
let hebrewDual = false
export function setHebrewCalendar({ enabled, dual }: { enabled?: boolean; dual?: boolean } = {}): void {
  hebrewCal = !!enabled
  hebrewDual = !!dual
}

/* "כ״ג תמוז" — gematria day + Hebrew month, for the agenda. */
function hebShortDate(d: Date): string {
  const p = hebrewParts(d)
  return `${p.dayText} ${p.month}`
}

/* "May 2026" / "מאי 2026" */
export function fmtMonthYear(date: DateInput): string {
  const d = toLocalDate(date)
  const lang = i18n.language || 'he'
  const locale = lang === 'he' ? 'he-IL' : lang
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d)
}

/* ── Formatting under an EXPLICIT pattern ────────────────────────
   The formatters below read the user's saved preference from module
   state, which is right everywhere in the app but useless in the one
   place that has to show what each option WOULD look like. Settings
   listed the raw pattern strings instead — "DD/MM/YY", "12h (AM/PM)" —
   which is developer notation offered to a coach as a choice.

   These take the pattern as an argument and are what the preference-
   reading versions delegate to, so an example in Settings can never
   drift from what the app then renders. */
export function formatTimeAs(pattern: string, date: DateInput): string {
  const d = toLocalDate(date)
  if (pattern === '12h') {
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
    const h12 = d.getHours() % 12 || 12
    return `${h12}:${pad(d.getMinutes())} ${ampm}`
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateAs(pattern: string, date: DateInput): string {
  const d = toLocalDate(date)
  if (Number.isNaN(d.getTime())) return ''
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  const yy = pad(yyyy % 100)
  if (pattern === 'MM/DD/YY') return `${mm}/${dd}/${yy}`
  if (pattern === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`
  return `${dd}/${mm}/${yy}`
}

export function fmtTime(date: DateInput): string {
  return formatTimeAs(timeFmt, date)
}

export function fmtShortDate(date: DateInput): string {
  const d = toLocalDate(date)
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  if (dateFmt === 'MM/DD/YY') return `${mm}/${dd}`
  if (dateFmt === 'YYYY-MM-DD') return `${mm}-${dd}`
  return `${dd}/${mm}`
}

/* Full date incl. year, per the user's date_format pref. Used by the
   custom DateField (the native <input type=date> ignores our pref and
   follows the browser's UI language instead). */
export function fmtDateInput(date: DateInput | null | undefined): string {
  if (!date) return ''
  return formatDateAs(dateFmt, date)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/* Backward-looking relative label for past moments: "now", "1 minute ago",
   "3 days ago", etc. Falls back to a short date for >30 days. */
export function fmtTimeAgo(date: DateInput, now: Date = new Date()): string {
  const d = toLocalDate(date)
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 0 || Math.floor(diffMs / 1000) < 60) return i18n.t('common:time.now')
  const lang = i18n.language || 'he'
  const locale = lang === 'he' ? 'he-IL' : lang
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const min = Math.floor(diffMs / 60000)
  if (min < 60) return rtf.format(-min, 'minute')
  const hr = Math.floor(min / 60)
  if (hr < 24) return rtf.format(-hr, 'hour')
  const day = Math.floor(hr / 24)
  if (day < 30) return rtf.format(-day, 'day')
  return fmtShortDate(d)
}

/* Whole CALENDAR days from today to `date` — 0 today, 1 tomorrow, negative
   for the past. Counted between local midnights, not from elapsed hours:
   something at 23:00 tonight and something at 08:00 tomorrow are one day
   apart to a reader and nine hours apart to a subtraction. Rounding the ms
   quotient also absorbs the 23/25-hour DST days. */
export function daysUntil(date: DateInput, now: Date = new Date()): number {
  const d = toLocalDate(date)
  if (Number.isNaN(d.getTime())) return NaN
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((to - from) / 86400000)
}

/* "עוד 3 ימים" — the near-future countdown, or null when there is nothing
   worth saying. Only 2–7 days out: today and tomorrow already have words of
   their own (relativeDayName), so a tag would repeat what the date line just
   said, and past a week a raw day count stops reading as a distance. */
export function daysUntilLabel(date: DateInput, now: Date = new Date()): string | null {
  const n = daysUntil(date, now)
  if (!Number.isFinite(n) || n < 2 || n > 7) return null
  return i18n.t('common:time.inDays', { count: n })
}

/* Relative-ish label: "Today 18:00", "Tomorrow 10:00", else "31/05 · 10:00". */
/* "היום" / "מחר" when the date is one of those, else null. Extracted so the
   date-only and date+time formatters cannot drift on which days get a word
   instead of a number. */
function relativeDayName(d: Date, now: Date): string | null {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const key = sameDay(d, now) ? 'today' : sameDay(d, tomorrow) ? 'tomorrow' : null
  if (!key) return null
  /* Fall back to the plain date when there is no word to use. i18n is
     initialised by the app but not by a unit test importing this directly,
     and the old code interpolated the lookup unconditionally — which printed
     the literal "undefined 17:35". A date is more use than that. */
  return i18n.t(`common:time.${key}`) || null
}

/* Hebrew agenda date when the mode is on (dual → Hebrew · Gregorian). */
function absoluteDatePart(d: Date): string {
  return hebrewCal
    ? (hebrewDual ? `${hebShortDate(d)} · ${fmtShortDate(d)}` : hebShortDate(d))
    : fmtShortDate(d)
}

export function formatWhen(date: DateInput, now: Date = new Date()): string {
  const d = toLocalDate(date)
  const rel = relativeDayName(d, now)
  /* The relative form takes a space and the absolute one a separator dot —
     "היום 10:00" but "12/08 · 10:00". Preserved from when this was one
     expression. */
  return rel ? `${rel} ${fmtTime(d)}` : `${absoluteDatePart(d)} · ${fmtTime(d)}`
}

/* The date WITHOUT the time — for an event that has no meaningful clock
   reading of its own. An all-day event carries a start_time of 00:00 purely
   as a storage artefact, so running it through formatWhen printed a spurious
   hour ("12/08 · 17:35 · כל היום" in the event modal, where the 17:35 is the
   sync timestamp and means nothing to the reader). */
export function formatDay(date: DateInput, now: Date = new Date()): string {
  const d = toLocalDate(date)
  return relativeDayName(d, now) ?? absoluteDatePart(d)
}

/* The day, or the range of days, an event occupies: "12/08", "היום", or
   "12/08–14/08". A range takes plain dates at BOTH ends — "היום–14/08" mixes
   a relative word with an absolute one and reads as a typo rather than as a
   span. Multi-day events became visible on every day they cover (see
   eventsForDay), so an agenda row that named only the first day would now be
   describing less than the calendar draws. */
export function formatDaySpan(e: SpanningEvent, now: Date = new Date()): string {
  const start = toLocalDate(e.when)
  const last = lastDayOf(e)
  if (sameDay(start, last)) return formatDay(start, now)
  return `${absoluteDatePart(start)}–${absoluteDatePart(last)}`
}

/* Day-separator label for a chat/feed: "Today" / "Yesterday", else the app's
   existing full day label (weekday + day + month, from calendar.ts). No time —
   that lives per-message. */
export function fmtRelativeDay(date: DateInput, now: Date = new Date()): string {
  const d = toLocalDate(date)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (sameDay(d, now)) return i18n.t('common:time.today')
  if (sameDay(d, yesterday)) return i18n.t('common:time.yesterday')
  return fmtDayLabel(d)
}
