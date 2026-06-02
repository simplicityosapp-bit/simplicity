/* ════════════════════════════════════════════════════════════════
   DATE HELPERS — light formatters for home widgets (he-IL, 24h).
   ════════════════════════════════════════════════════════════════ */

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

const HE_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

/* "מאי 2026" */
export function fmtMonthYear(date) {
  const d = date instanceof Date ? date : new Date(date)
  return `${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`
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

/* Backward-looking relative label for past moments: "כעת", "לפני שעה",
   "לפני 3 ימים", etc. Falls back to a short date for >30 days. */
export function fmtTimeAgo(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 0) return 'כעת'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return 'כעת'
  const min = Math.floor(sec / 60)
  if (min < 60) return min === 1 ? 'לפני דקה' : `לפני ${min} דקות`
  const hr = Math.floor(min / 60)
  if (hr < 24) return hr === 1 ? 'לפני שעה' : `לפני ${hr} שעות`
  const day = Math.floor(hr / 24)
  if (day < 30) return day === 1 ? 'אתמול' : `לפני ${day} ימים`
  return fmtShortDate(d)
}

/* Relative-ish label: "היום 18:00", "מחר 10:00", else "31/05 · 10:00". */
export function formatWhen(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (sameDay(d, now)) return `היום ${fmtTime(d)}`
  if (sameDay(d, tomorrow)) return `מחר ${fmtTime(d)}`
  return `${fmtShortDate(d)} · ${fmtTime(d)}`
}
