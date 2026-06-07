/* ════════════════════════════════════════════════════════════════
   CALENDAR HELPERS — date math + event bucketing for the day / week /
   month views. All helpers stay in local time so a meeting "today at
   10:00" matches the date the user is looking at, regardless of UTC.
   ════════════════════════════════════════════════════════════════ */

const MS_PER_DAY = 24 * 60 * 60 * 1000

export const DAY_NAMES_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export const DAY_NAMES_FULL  = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const MONTH_NAMES_HE  = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

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

/* Formatted labels for the header (date range under the toggle). */
export function fmtDayLabel(date) {
  const d = new Date(date)
  return `יום ${DAY_NAMES_FULL[d.getDay()]} · ${d.getDate()} ${MONTH_NAMES_HE[d.getMonth()]}`
}

export { MS_PER_DAY }
