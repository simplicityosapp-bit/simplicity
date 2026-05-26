/* ════════════════════════════════════════════════════════════════
   DATE HELPERS — light formatters for home widgets (he-IL, 24h).
   ════════════════════════════════════════════════════════════════ */

const pad = (n) => String(n).padStart(2, '0')

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
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtShortDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/* Relative-ish label: "היום 18:00", "מחר 10:00", else "31/05 · 10:00". */
export function formatWhen(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (sameDay(d, now)) return `היום ${fmtTime(d)}`
  if (sameDay(d, tomorrow)) return `מחר ${fmtTime(d)}`
  return `${fmtShortDate(d)} · ${fmtTime(d)}`
}
