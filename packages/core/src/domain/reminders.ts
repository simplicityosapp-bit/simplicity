/* ════════════════════════════════════════════════════════════════
   REMINDERS — recurrence helpers.
   A recurring reminder is a single row carrying recurrence_type +
   recurrence_pattern. Completing it ADVANCES scheduled_at by one interval
   (so it comes back) instead of being marked done forever. scheduled_at
   always points at the earliest occurrence not yet handled; how many
   occurrences have come due is derived (the "xN" badge).
   ════════════════════════════════════════════════════════════════ */

const DAY = 86400000

export interface Reminder {
  recurrence_type?: string | null
  recurrence_pattern?: { dayOfWeek?: number; dayOfMonth?: number; x?: number | string } | null
  scheduled_at: string | number | Date
  status?: string | null
}

export const isRecurring = (r: Reminder | null | undefined): boolean =>
  !!r && !!r.recurrence_type && r.recurrence_type !== 'none'

const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/* Short human label for a recurrence ("שבועי · שלישי", "חודשי", "כל 3 ימים"). */
export function recurrenceLabel(r: Reminder): string {
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
export function nextScheduledAt(r: Reminder): Date {
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
export function dueOccurrenceCount(r: Reminder, now: Date = new Date()): number {
  const base = new Date(r.scheduled_at)
  if (base > now) return 0
  if (!isRecurring(r)) return 1
  if (r.recurrence_type === 'weekly') return Math.floor((now.getTime() - base.getTime()) / (7 * DAY)) + 1
  if (r.recurrence_type === 'every_x_days') {
    const x = Number(r.recurrence_pattern?.x) || 1
    return Math.floor((now.getTime() - base.getTime()) / (x * DAY)) + 1
  }
  if (r.recurrence_type === 'monthly_date') {
    /* Compare against the CONFIGURED day-of-month (clamped to this month),
       not base.getDate() — which may itself be clamped (a "31st" reminder
       whose scheduled_at landed on Feb 28 would otherwise count a month
       early). */
    const dom = Number(r.recurrence_pattern?.dayOfMonth) || base.getDate()
    const months = (now.getFullYear() - base.getFullYear()) * 12 + (now.getMonth() - base.getMonth())
    const dueDayThisMonth = Math.min(dom, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())
    return Math.max(months + (now.getDate() >= dueDayThisMonth ? 1 : 0), 1)
  }
  return 1
}

/* A recurring reminder is "active" while not stopped (completed/dismissed). */
export const isActiveReminder = (r: Reminder | null | undefined): boolean =>
  !!r && r.status !== 'completed' && r.status !== 'dismissed'
