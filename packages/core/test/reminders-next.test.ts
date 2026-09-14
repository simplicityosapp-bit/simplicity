/* ════════════════════════════════════════════════════════════════
   A NEW RECURRING REMINDER starts at its next future occurrence.
   ════════════════════════════════════════════════════════════════
   The phone saved the typed date (default: today) as the first
   occurrence, so a weekly reminder made at 10:00 for 09:00 was overdue
   on arrival. These pin the rule both apps now share.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { nextWeeklyOccurrence, nextMonthlyOccurrence, dueOccurrenceCount } from '../src/domain/reminders'

const at = (s: string) => new Date(s)
const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

describe('nextWeeklyOccurrence', () => {
  const MON_10 = at('2026-09-14T10:00:00') // a Monday

  it('later this week when the weekday is still ahead', () => {
    expect(local(nextWeeklyOccurrence(2, '09:00', MON_10))).toBe('2026-09-15 09:00')
  })

  it('today, while today\'s hour has not come yet', () => {
    expect(local(nextWeeklyOccurrence(1, '18:30', MON_10))).toBe('2026-09-14 18:30')
  })

  it('next week once today\'s hour has passed — never overdue on arrival', () => {
    const first = nextWeeklyOccurrence(1, '09:00', MON_10)
    expect(local(first)).toBe('2026-09-21 09:00')
    expect(dueOccurrenceCount({ recurrence_type: 'weekly', recurrence_pattern: { dayOfWeek: 1 }, scheduled_at: first }, MON_10)).toBe(0)
  })
})

describe('nextMonthlyOccurrence', () => {
  it('this month while the day is still ahead', () => {
    expect(local(nextMonthlyOccurrence(20, '09:00', at('2026-09-14T10:00:00')))).toBe('2026-09-20 09:00')
  })

  it('next month once it has passed', () => {
    expect(local(nextMonthlyOccurrence(10, '09:00', at('2026-09-14T10:00:00')))).toBe('2026-10-10 09:00')
  })

  it('clamps the 31st to a shorter month', () => {
    expect(local(nextMonthlyOccurrence(31, '09:00', at('2026-09-14T10:00:00')))).toBe('2026-09-30 09:00')
  })
})
