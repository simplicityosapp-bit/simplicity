/* ════════════════════════════════════════════════════════════════
   CALENDAR HELPERS — date math + event bucketing for the day / week /
   month views. All helpers stay in local time so a meeting "today at
   10:00" matches the date the user is looking at, regardless of UTC.
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/* Legacy Hebrew constants — kept for the Jewish-calendar day label (which is
   inherently Hebrew) and any consumer that still reads them directly. The
   Gregorian calendar UI resolves day/month names via i18n instead (see the
   *Names() helpers below) so it follows the active language. */
export const DAY_NAMES_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export const DAY_NAMES_FULL  = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const MONTH_NAMES_HE  = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/* Language-aware Gregorian name lists (he/en/es; fr falls back to he until its
   language pass fills calendar). Resolved fresh per call so they reflect the
   active language; callers re-render via useT on a language switch. Pass an
   explicit `lng` (e.g. from useT().lang) to make a memo recompute on a switch. */
export const weekdayNamesShort = (lng) => i18n.t('calendar:greg.weekdaysShort', { returnObjects: true, lng })
export const weekdayNamesLong  = (lng) => i18n.t('calendar:greg.weekdaysLong', { returnObjects: true, lng })
export const monthNamesLong    = (lng) => i18n.t('calendar:greg.monthsLong', { returnObjects: true, lng })
export const monthNamesShort   = (lng) => i18n.t('calendar:greg.monthsShort', { returnObjects: true, lng })

export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function isSameDay(a, b) {
  if (!a || !b) return false
  const da = a instanceof Date ? a : new Date(a)
  const db = b instanceof Date ? b : new Date(b)
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate()
  }

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/* First-day-of-week index — 0=Sunday, 1=Monday. The userPreferences
   value comes in as the string 'sunday' | 'monday'; default Sunday. */
export function weekStartIndex(weekStartPref) {
  return weekStartPref === 'monday' ? 1 : 0
}

/* Walk backward from `d` until we land on the week-start day. */
export function startOfWeek(d, weekStart = 'sunday') {
  const idx = weekStartIndex(weekStart)
  const x = startOfDay(d)
  while (x.getDay() !== idx) x.setDate(x.getDate() - 1)
  return x
}

/* 6-week grid starting from the first day of the week that contains
   the 1st of `monthDate`'s month. 6 rows × 7 cols = 42 cells covers
   every layout, no exception. */
export function monthGrid(monthDate, weekStart = 'sunday') {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const gridStart = startOfWeek(first, weekStart)
  const cells = []
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i))
  return cells
}

/* All events on the day matching `date`, sorted by time ascending. */
export function eventsForDay(events, date) {
  return (events || [])
    .filter((e) => isSameDay(e.when, date))
    .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())
}

/* Counts of events per day in a given range — used by the month
   grid's dot indicator. */
export function eventsByDate(events) {
  const map = new Map()
  for (const e of (events || [])) {
    const d = new Date(e.when)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const list = map.get(key) || []
    list.push(e)
    map.set(key, list)
  }
  return map
}

export function dateKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
}

/* Formatted labels for the header (date range under the toggle). Language-aware
   via the calendar namespace (he keeps the original "יום … · … …" form). */
export function fmtDayLabel(date) {
  const d = new Date(date)
  return i18n.t('calendar:greg.dayLabel', {
    weekday: weekdayNamesLong()[d.getDay()],
    day: d.getDate(),
    month: monthNamesLong()[d.getMonth()],
  })
}

/* ════════════════════════════════════════════════════════════════
   HEBREW (JEWISH) CALENDAR — display only.
   Stored timestamps stay Gregorian (Google Calendar interop); these
   helpers only RE-LABEL a civil date in the Hebrew calendar using the
   platform's own Intl calendar — never hand-rolled molad math, so leap
   years and Adar I/II are always correct. Parts are read at local noon
   so a midnight / DST boundary can't roll a cell onto the wrong day.
   ════════════════════════════════════════════════════════════════ */

const HEBREW_LOCALE = 'he-u-ca-hebrew'
const _hebFmt = new Intl.DateTimeFormat(HEBREW_LOCALE, { year: 'numeric', month: 'long', day: 'numeric' })

/* Gematria building blocks. 15→ט״ו / 16→ט״ז are spelled specially
   (never יה / יו) by long-standing convention. */
const HEB_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const HEB_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const HEB_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']

function hebLettersUnder1000(n) {
  let out = HEB_HUNDREDS[Math.floor(n / 100)]
  const rest = n % 100
  if (rest === 15) out += 'טו'
  else if (rest === 16) out += 'טז'
  else out += HEB_TENS[Math.floor(rest / 10)] + HEB_ONES[rest % 10]
  return out
}

/* Hebrew numeral with geresh / gershayim — day-of-month (1–30) and the
   year (shown without the 5000s, e.g. 5786 → תשפ״ו, the everyday form). */
export function hebrewNumeral(n) {
  const letters = hebLettersUnder1000(((n % 1000) + 1000) % 1000)
  if (!letters) return ''
  if (letters.length === 1) return `${letters}׳`
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`
}

/* { day:9, dayText:'ט׳', month:'תמוז', year:5786, yearText:'תשפ״ו' }.
   Read at local noon — the Hebrew date assigned to a civil day. */
export function hebrewParts(date) {
  const x = new Date(date)
  x.setHours(12, 0, 0, 0)
  const p = _hebFmt.formatToParts(x).reduce((a, part) => { a[part.type] = part.value; return a }, {})
  const day = parseInt(p.day, 10)
  const year = parseInt(p.year, 10)
  return { day, dayText: hebrewNumeral(day), month: p.month, year, yearText: hebrewNumeral(year) }
}

/* Gematria day-of-month, e.g. כ״ג — for the month / week grid cells. */
export function hebrewDayNum(date) {
  return hebrewParts(date).dayText
}

/* True when both civil dates fall in the same Hebrew month (name+year).
   A 42-day grid never spans two like-named months, so name+year is safe. */
export function isSameHebrewMonth(a, b) {
  const pa = hebrewParts(a)
  const pb = hebrewParts(b)
  return pa.month === pb.month && pa.year === pb.year
}

/* The civil day whose Hebrew date is the 1st of date's Hebrew month —
   found by walking back day-by-day (≤30) until the Hebrew day is 1. */
export function startOfHebrewMonth(date) {
  let x = startOfDay(date)
  let guard = 0
  while (hebrewParts(x).day !== 1 && guard++ < 40) x = addDays(x, -1)
  return x
}

/* Step to the 1st of the previous / next Hebrew month. Forward: jump
   past this month's max length (30) then snap to that month's start.
   Backward: the day before this month's start is in the prior month. */
export function stepHebrewMonth(date, dir) {
  const start = startOfHebrewMonth(date)
  return dir > 0 ? startOfHebrewMonth(addDays(start, 31)) : startOfHebrewMonth(addDays(start, -1))
}

/* The only month whose name varies between common and leap years is Adar —
   אדר / אדר א׳ / אדר ב׳ all share this base, so a year-jump can match across
   the leap boundary instead of falling back to תשרי. */
function hebrewMonthBase(name) {
  return name.startsWith('אדר') ? 'אדר' : name
}

/* Step a whole Hebrew year, landing on the same month in the target year.
   When the exact name is absent (an Adar variant crossing a common↔leap
   boundary) fall back to the same base month — preferring the LAST one, so
   entering a leap year lands on אדר ב׳ (the festive Adar) and leaving one
   lands on the lone אדר. No molad math — purely the platform calendar. */
export function stepHebrewYear(date, dir) {
  const name = hebrewParts(date).month
  const months = hebrewMonthsOfYear(date)
  const edge = dir > 0 ? months[months.length - 1].date : months[0].date
  const inTargetYear = stepHebrewMonth(edge, dir)   /* Tishrei fwd / Elul back */
  const target = hebrewMonthsOfYear(inTargetYear)
  let match = target.find((m) => m.name === name)
  if (!match) {
    const base = hebrewMonthBase(name)
    const baseMatches = target.filter((m) => hebrewMonthBase(m.name) === base)
    match = baseMatches[baseMatches.length - 1]
  }
  return (match || target[0]).date
}

/* 6-week (42-cell) grid for the Hebrew month containing `date`, starting
   from the week-start of that month's 1st — mirror of monthGrid(). */
export function hebrewMonthGrid(date, weekStart = 'sunday') {
  const first = startOfHebrewMonth(date)
  const gridStart = startOfWeek(first, weekStart)
  const cells = []
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i))
  return cells
}

/* The Hebrew months of the Hebrew year containing `date`, each as
   { date: <civil 1st of that month>, name }. Returns 12 entries, or 13
   in a leap year (אדר א׳ + אדר ב׳) — derived by walking the calendar, so
   the count is always right. Used by the header's month picker. */
export function hebrewMonthsOfYear(date) {
  let cursor = startOfHebrewMonth(date)
  let guard = 0
  while (hebrewParts(cursor).month !== 'תשרי' && guard++ < 14) cursor = stepHebrewMonth(cursor, -1)
  const year = hebrewParts(cursor).year
  const months = []
  guard = 0
  while (hebrewParts(cursor).year === year && guard++ < 14) {
    months.push({ date: cursor, name: hebrewParts(cursor).month })
    cursor = stepHebrewMonth(cursor, +1)
  }
  return months
}

/* "ניסן תשפ״ו" — month name + gematria year, for the header picker. */
export function hebrewMonthLabel(date) {
  const p = hebrewParts(date)
  return `${p.month} ${p.yearText}`
}

/* "יום ראשון · ט׳ בתמוז תשפ״ו" — full day label for the day view. */
export function fmtHebrewDayLabel(date) {
  const d = new Date(date)
  const p = hebrewParts(date)
  return `יום ${DAY_NAMES_FULL[d.getDay()]} · ${p.dayText} ב${p.month} ${p.yearText}`
}

export { MS_PER_DAY }
