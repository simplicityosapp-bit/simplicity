/* ════════════════════════════════════════════════════════════════
   REMINDERS — recurrence helpers.
   A recurring reminder is a single row carrying recurrence_type +
   recurrence_pattern. Completing it ADVANCES scheduled_at by one interval
   (so it comes back) instead of being marked done forever. scheduled_at
   always points at the earliest occurrence not yet handled; how many
   occurrences have come due is derived (the "xN" badge).
   ════════════════════════════════════════════════════════════════ */

const DAY = 86400000

export const isRecurring = (r) => !!r && !!r.recurrence_type && r.recurrence_type !== 'none'

const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/* Short human label for a recurrence ("שבועי · שלישי", "חודשי", "כל 3 ימים"). */
export function recurrenceLabel(r) {
  if (r.recurrence_type === 'weekly') {
    const d = r.recurrence_pattern?.dayOfWeek
    return typeof d === 'number' ? `שבועי · יום ${HEB_DAYS[d]}` : 'שבועי'
  }
  if (r.recurrence_type === 'monthly_date') {
    const d = r.recurrence_pattern?.dayOfMonth
    return d ? `חודשי · ${d} בחודש` : 'חודשי'
  }
  if (r.recurrence_type === 'every_x_days') {
    const x = Number(r.recurrence_pattern?.x) || 0
    return x ? `כל ${x} ימים` : 'כל X ימים'
  }
  return ''
}

/* The next scheduled_at after advancing ONE interval (used on complete). */
export function nextScheduledAt(r) {
  const d = new Date(r.scheduled_at)
  if (r.recurrence_type === 'weekly') d.setDate(d.getDate() + 7)
  else if (r.recurrence_type === 'monthly_date') {
    /* advance one month, clamping the target day to the next month's length
       so "31st" doesn't roll over into the month after in shorter months. */
    const dom = Number(r.recurrence_pattern?.dayOfMonth) || d.getDate()
    const y = d.getFullYear()
    const nextMonth = d.getMonth() + 1
    const lastDay = new Date(y, nextMonth + 1, 0).getDate()
    d.setFullYear(y, nextMonth, Math.min(dom, lastDay))
  } else if (r.recurrence_type === 'every_x_days') d.setDate(d.getDate() + (Number(r.recurrence_pattern?.x) || 1))
  return d
}

/* How many occurrences are due (from scheduled_at up to `now`). 0 when the
   next occurrence is still in the future; 1 for a plain due reminder. */
export function dueOccurrenceCount(r, now = new Date()) {
  const base = new Date(r.scheduled_at)
  if (base > now) return 0
  if (!isRecurring(r)) return 1
  if (r.recurrence_type === 'weekly') return Math.floor((now - base) / (7 * DAY)) + 1
  if (r.recurrence_type === 'every_x_days') {
    const x = Number(r.recurrence_pattern?.x) || 1
    return Math.floor((now - base) / (x * DAY)) + 1
  }
  if (r.recurrence_type === 'monthly_date') {
    const months = (now.getFullYear() - base.getFullYear()) * 12 + (now.getMonth() - base.getMonth())
    return Math.max(months + (now.getDate() >= base.getDate() ? 1 : 0), 1)
  }
  return 1
}

/* A recurring reminder is "active" while not stopped (completed/dismissed). */
export const isActiveReminder = (r) => r && r.status !== 'completed' && r.status !== 'dismissed'
