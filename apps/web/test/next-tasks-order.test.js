/* ════════════════════════════════════════════════════════════════
   NEXT-TASKS-ORDER SUITE — the home tasks widget orders by PRESSURE,
   not by priority alone (lib/homeData nextTasks + overdueTasksCount).

   `tasks.due_at` has existed since the column was added, and the tasks
   screen buckets by it (overdue / today / this week / later). Home did not:
   it sorted on priority and never rendered a date, so a task due this
   morning sat below one flagged urgent with no deadline at all — and
   nothing on screen explained the order.

   Rank: overdue → due today → flagged urgent → the rest; then soonest
   deadline, then priority.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { nextTasks, overdueTasksCount, openTasksCount } from '../src/lib/homeData'

const now = new Date(2026, 6, 21, 14, 0, 0) // Tue 2026-07-21, 14:00 local
const at = (day, h, m = 0) => new Date(2026, 6, day, h, m, 0).toISOString()

const tasks = [
  { id: 'low-undated', title: 'לקרוא מאמר', priority: 'low', status: 'todo' },
  { id: 'high-undated', title: 'לחזור למיכל', priority: 'high', status: 'todo' },
  { id: 'due-today-late', title: 'להכין חומרים', priority: 'low', status: 'todo', due_at: at(21, 18) },
  { id: 'overdue-days', title: 'להגיש דוח', priority: 'low', status: 'todo', due_at: at(19, 12) },
  { id: 'overdue-hours', title: 'לשלוח חוזה', priority: 'medium', status: 'todo', due_at: at(21, 10) },
  { id: 'high-next-week', title: 'לתכנן סדנה', priority: 'high', status: 'todo', due_at: at(28, 9) },
  { id: 'med-tomorrow', title: 'לעדכן את האתר', priority: 'medium', status: 'todo', due_at: at(22, 9) },
  { id: 'done', title: 'בוצע', priority: 'high', status: 'done', due_at: at(19, 9) },
  { id: 'deleted', title: 'נמחק', priority: 'high', status: 'todo', due_at: at(19, 9), deleted_at: at(20, 9) },
]

const order = nextTasks(999, tasks, now).map((t) => t.id)

describe('nextTasks — ordered by pressure', () => {
  it('puts overdue first, oldest deadline leading', () => {
    expect(order.slice(0, 2)).toEqual(['overdue-days', 'overdue-hours'])
  })

  it('puts today\'s deadline next, ahead of anything merely flagged urgent', () => {
    /* THE regression: a low-priority task due today outranks a high-priority
       one with no deadline. Priority-only sorting had this exactly backwards. */
    expect(order.indexOf('due-today-late')).toBeLessThan(order.indexOf('high-undated'))
  })

  it('then the urgent-flagged ones, whatever their date', () => {
    expect(order.indexOf('high-undated')).toBeLessThan(order.indexOf('med-tomorrow'))
    expect(order.indexOf('high-next-week')).toBeLessThan(order.indexOf('med-tomorrow'))
  })

  it('within the urgent rank, a deadline beats no deadline', () => {
    expect(order.indexOf('high-next-week')).toBeLessThan(order.indexOf('high-undated'))
  })

  it('leaves the undated, unflagged task last', () => {
    expect(order[order.length - 1]).toBe('low-undated')
  })

  it('produces the full expected order', () => {
    expect(order).toEqual([
      'overdue-days',    // deadline passed, days ago
      'overdue-hours',   // deadline passed, this morning
      'due-today-late',  // due today at 18:00
      'high-next-week',  // urgent, has a deadline
      'high-undated',    // urgent, no deadline
      'med-tomorrow',    // everything else, soonest first
      'low-undated',
    ])
  })

  it('excludes done and deleted tasks', () => {
    expect(order).not.toContain('done')
    expect(order).not.toContain('deleted')
  })

  it('still honours the limit, and still defaults `now` to the real clock', () => {
    expect(nextTasks(3, tasks, now)).toHaveLength(3)
    expect(() => nextTasks(5, tasks)).not.toThrow()
  })

  it('treats an unparseable due_at as undated rather than throwing', () => {
    const odd = [{ id: 'bad', priority: 'low', status: 'todo', due_at: 'not-a-date' }]
    expect(nextTasks(9, odd, now).map((t) => t.id)).toEqual(['bad'])
  })
})

describe('overdueTasksCount', () => {
  it('counts only open tasks whose deadline has passed', () => {
    expect(overdueTasksCount(tasks, now)).toBe(2)
  })

  it('ignores done, deleted and undated tasks', () => {
    /* 'done' and 'deleted' both carry a passed due_at on purpose. */
    expect(overdueTasksCount([
      { id: 'a', status: 'done', due_at: at(19, 9) },
      { id: 'b', status: 'todo', due_at: at(19, 9), deleted_at: at(20, 9) },
      { id: 'c', status: 'todo' },
    ], now)).toBe(0)
  })

  it('is never larger than the open-task count', () => {
    expect(overdueTasksCount(tasks, now)).toBeLessThanOrEqual(openTasksCount(tasks))
  })
})
