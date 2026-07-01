/* ════════════════════════════════════════════════════════════════
   DATE HELPERS — light formatters for home widgets (locale-aware, 24h).
   ════════════════════════════════════════════════════════════════ */

import i18n from '@simplicity/core/i18n'
import { hebrewParts } from './calendar'

const pad = (n) => String(n).padStart(2, '0')

/* Date/time format preference — set once from PrefsApplier (mirrors how
   lib/finance receives the currency). Every formatter below reads these,
   so the "תשלומים ומטבע" date/time settings drive the whole app. */
let dateFmt = 'DD/MM/YY'   /* DD/MM/YY | MM/DD/YY | YYYY-MM-DD */
let timeFmt = '24h'        /* 24h | 12h */
export function setDateTimeFormat({ date_format, time_format } = {}) {
  if (date_format) dateFmt = date_format
  if (time_format) timeFmt = time_format
}

/* Hebrew-calendar display flag — set from PrefsApplier (Settings →
   Appearance). Only the agenda-style formatWhen() honours it; the broad
   fmtShortDate stays Gregorian so finance / records / exports are
   unaffected. `dual` appends the Gregorian date alongside the Hebrew. */
let hebrewCal = false
let hebrewDual = false
export function setHebrewCalendar({ enabled, dual } = {}) {
  hebrewCal = !!enabled
  hebrewDual = !!dual
}

/* "כ״ג תמוז" — gematria day + Hebrew month, for the agenda. */
function hebShortDate(d) {
  const p = hebrewParts(d)
  return `${p.dayText} ${p.month}`
}

/* "May 2026" / "מאי 2026" */
export function fmtMonthYear(date) {
  const d = date instanceof Date ? date : new Date(date)
  const lang = i18n.language || 'he'
  const locale = lang === 'he' ? 'he-IL' : lang
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d)
}

export function fmtTime(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (timeFmt === '12h') {
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
    const h12 = d.getHours() % 12 || 12
    return `${h12}:${pad(d.getMinutes())} ${ampm}`
  }
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtShortDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  if (dateFmt === 'MM/DD/YY') return `${mm}/${dd}`
  if (dateFmt === 'YYYY-MM-DD') return `${mm}-${dd}`
  return `${dd}/${mm}`
}

/* Full date incl. year, per the user's date_format pref. Used by the
   custom DateField (the native <input type=date> ignores our pref and
   follows the browser's UI language instead). */
export function fmtDateInput(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const dd = pad(d.getDate())
  const mm = pad(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  const yy = pad(yyyy % 100)
  if (dateFmt === 'MM/DD/YY') return `${mm}/${dd}/${yy}`
  if (dateFmt === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`
  return `${dd}/${mm}/${yy}`
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/* Backward-looking relative label for past moments: "now", "1 minute ago",
   "3 days ago", etc. Falls back to a short date for >30 days. */
export function fmtTimeAgo(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
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
export function formatWhen(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (sameDay(d, now)) return `${i18n.t('common:time.today')} ${fmtTime(d)}`
  if (sameDay(d, tomorrow)) return `${i18n.t('common:time.tomorrow')} ${fmtTime(d)}`
  /* Hebrew agenda date when the mode is on (dual → Hebrew · Gregorian). */
  const datePart = hebrewCal
    ? (hebrewDual ? `${hebShortDate(d)} · ${fmtShortDate(d)}` : hebShortDate(d))
    : fmtShortDate(d)
  return `${datePart} · ${fmtTime(d)}`
}
