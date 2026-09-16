/* A question's schedule as written and as edited, today's skips, and the
   daily reminder. The write side is the one with teeth: schedule_pattern is
   NOT NULL, and "every day" saved as null is refused by the database. */
import { describe, it, expect } from 'vitest'
import { questionSchedulePattern, scheduleFromPattern, skippedQuestionIds, isQuestionReminderDue, isQuestionDueToday } from '../src'

describe('questionSchedulePattern', () => {
  it('never writes null for every day', () => {
    expect(questionSchedulePattern('every_day')).toEqual({})
    expect(questionSchedulePattern('days_of_week', [0, 1, 2, 3, 4, 5, 6])).toEqual({})
    expect(questionSchedulePattern('every_x_days', [], 1)).toEqual({})
  })

  it('writes the chosen days and intervals', () => {
    expect(questionSchedulePattern('days_of_week', [3, 1])).toEqual({ type: 'days_of_week', values: [1, 3] })
    expect(questionSchedulePattern('every_x_days', [], '3')).toEqual({ type: 'every_x_days', x: 3 })
  })

  it('the {} it writes reads back as every day', () => {
    expect(isQuestionDueToday({ schedule_pattern: {} } as never, new Date(2026, 8, 16))).toBe(true)
  })
})

describe('scheduleFromPattern', () => {
  it('round-trips what the editor saves', () => {
    expect(scheduleFromPattern({ type: 'days_of_week', values: [1, 3] })).toMatchObject({ mode: 'days_of_week', days: [1, 3] })
    expect(scheduleFromPattern({ type: 'every_x_days', x: 4 })).toMatchObject({ mode: 'every_x_days', x: 4 })
  })

  it('reads null, {}, all days and every-1-day as every day', () => {
    for (const p of [null, {}, { type: 'days_of_week', values: [0, 1, 2, 3, 4, 5, 6] }, { type: 'every_x_days', x: 1 }]) {
      expect(scheduleFromPattern(p as never).mode).toBe('every_day')
    }
  })
})

describe('skippedQuestionIds', () => {
  it("is today's set, and empty once the day has turned", () => {
    expect(skippedQuestionIds({ date: '2026-09-16', ids: ['a'] }, '2026-09-16')).toEqual(['a'])
    expect(skippedQuestionIds({ date: '2026-09-15', ids: ['a'] }, '2026-09-16')).toEqual([])
    expect(skippedQuestionIds(null, '2026-09-16')).toEqual([])
  })
})

describe('isQuestionReminderDue', () => {
  it('is due from the chosen time on, and never when switched off', () => {
    expect(isQuestionReminderDue({ enabled: true, time: '20:00' }, new Date(2026, 8, 16, 19, 59))).toBe(false)
    expect(isQuestionReminderDue({ enabled: true, time: '20:00' }, new Date(2026, 8, 16, 20, 0))).toBe(true)
    expect(isQuestionReminderDue({ enabled: false, time: '08:00' }, new Date(2026, 8, 16, 21, 0))).toBe(false)
  })
})
