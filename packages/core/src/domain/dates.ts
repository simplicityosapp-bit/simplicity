/* ════════════════════════════════════════════════════════════════
   DATE HELPERS — light formatters for home widgets (locale-aware, 24h).
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'
import { hebrewParts, fmtDayLabel, type DateInput } from './calendar'

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
   days or months (domain/finance, the finance screen) — not just formatters. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
export function toLocalDate(value: DateInput): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value as string | number)
}

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

export function fmtTime(date: DateInput): string {
  const d = toLocalDate(date)
  if (timeFmt === '12h') {
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
    const h12 = d.getHours() % 12 || 12
    return `${h12}:${pad(d.getMinutes())} ${ampm}`
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  const d = toLocalDate(date)
  if (Number.isNaN(d.getTime())) return ''
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  const yy = pad(yyyy % 100)
  if (dateFmt === 'MM/DD/YY') return `${mm}/${dd}/${yy}`
  if (dateFmt === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`
  return `${dd}/${mm}/${yy}`
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

/* Relative-ish label: "Today 18:00", "Tomorrow 10:00", else "31/05 · 10:00". */
export function formatWhen(date: DateInput, now: Date = new Date()): string {
  const d = toLocalDate(date)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (sameDay(d, now)) return `${i18n.t('common:time.today')} ${fmtTime(d)}`
  if (sameDay(d, tomorrow)) return `${i18n.t('common:time.tomorrow')} ${fmtTime(d)}`
  /* Hebrew agenda date when the mode is on (dual → Hebrew · Gregorian). */
  const datePart = hebrewCal
    ? (hebrewDual ? `${hebShortDate(d)} · ${fmtShortDate(d)}` : hebShortDate(d))
    : fmtShortDate(d)
  return `${datePart} · ${fmtTime(d)}`
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
