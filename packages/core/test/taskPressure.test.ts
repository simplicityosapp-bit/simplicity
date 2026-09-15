/* The ranking the mixed tasks+reminders list runs on, in both apps. The full
   rule set is pinned against web's re-export in apps/web/test/tasks-pressure;
   this covers the pieces added in the move: postpone and the group sorts. */
import { describe, it, expect } from 'vitest'
import { pressureBucket, byPressure, tomorrowAt, canPostpone, byDueDate, byRecency, PRESSURE_KEYS } from '../src/domain/taskPressure'

const now = new Date(2026, 6, 21, 14, 0, 0)
const at = (day: number, h: number) => new Date(2026, 6, day, h, 0, 0).toISOString()

describe('pressure', () => {
  it('puts an undated urgent task above next week', () => {
    expect(pressureBucket({ kind: 'task', when: null, task: { priority: 'high' } }, now)).toBe('urgent')
    expect(PRESSURE_KEYS.indexOf('urgent')).toBeLessThan(PRESSURE_KEYS.indexOf('week'))
  })
  it('never promotes a reminder out of its date bucket', () => {
    expect(pressureBucket({ kind: 'reminder', when: at(25, 9) }, now)).toBe('week')
  })
  it('lets the dated row lead an undated one', () => {
    const rows = [{ kind: 'task' as const, when: null, task: { priority: 'high' } }, { kind: 'task' as const, when: at(23, 9), task: { priority: 'high' } }]
    expect(rows.sort(byPressure)[0].when).toBe(at(23, 9))
  })
})

describe('postpone', () => {
  it('moves to tomorrow at the item\'s own time', () => {
    const next = new Date(tomorrowAt(at(10, 9), now)!)
    expect([next.getDate(), next.getHours()]).toEqual([22, 9])
  })
  it('is offered only for today or overdue', () => {
    expect(canPostpone(at(21, 18), now)).toBe(true)
    expect(canPostpone(at(3, 9), now)).toBe(true)
    expect(canPostpone(at(28, 9), now)).toBe(false)
    expect(canPostpone(null, now)).toBe(false)
  })
})

describe('group sorts', () => {
  it('orders by deadline with undated last', () => {
    const rows = [{ due_at: null }, { due_at: at(25, 9) }, { due_at: at(22, 9) }]
    expect(rows.sort(byDueDate).map((r) => r.due_at)).toEqual([at(22, 9), at(25, 9), null])
  })
  it('orders finished work newest first', () => {
    const rows = [{ completed_at: at(1, 9) }, { completed_at: at(20, 9) }]
    expect(rows.sort(byRecency)[0].completed_at).toBe(at(20, 9))
  })
})
