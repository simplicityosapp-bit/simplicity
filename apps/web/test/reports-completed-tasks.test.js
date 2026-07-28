/* ════════════════════════════════════════════════════════════════
   COMPLETED TASKS SURVIVE DELETION — reports count the event, not the row.
   ════════════════════════════════════════════════════════════════
   A beta user finished a month's work, tidied the finished tasks off the
   tasks screen, and watched that month's "משימות שהושלמו" fall towards zero
   (feedback acbbeaa5). Completing a task is an event that happened on a
   date; deleting the row afterwards does not un-happen it.

   The trap is that this metric looks WRONG next to its neighbours. Every
   other flow metric in computeReportForRange filters through live(), and
   `(tasks || [])` sitting among them reads like an oversight — a tidy-up
   pass would "fix" it back and silently reintroduce the bug. Hence a test
   rather than a comment alone.

   Note the asymmetry is deliberate, not an accident this suite should
   spread: deleting a lead or a transaction usually means "this was a
   mistake, take it out of the numbers", while deleting a done task means
   "I'm done looking at it". Only the tasks metric changed.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { computeReportForRange, getDrillRecords } from '@simplicity/core'

const START = new Date(2026, 5, 1, 0, 0, 0, 0)          /* June 2026 */
const END = new Date(2026, 5, 30, 23, 59, 59, 999)
const inJune = '2026-06-15T09:00:00.000Z'
const inJuly = '2026-07-15T09:00:00.000Z'

const task = (over = {}) => ({
  id: 'x', title: 'a task', status: 'done',
  created_at: '2026-06-01T08:00:00.000Z',
  completed_at: inJune,
  deleted_at: null,
  ...over,
})

const count = (tasks) => computeReportForRange(START, END, { tasks }).metrics.tasksCompleted

describe('tasksCompleted counts the completion, not the surviving row', () => {
  it('counts a task that was completed in the period', () => {
    expect(count([task()])).toBe(1)
  })

  it('still counts it after it is deleted', () => {
    /* The reported bug, in one line. */
    expect(count([task({ deleted_at: '2026-07-02T10:00:00.000Z' })])).toBe(1)
  })

  it('counts it even when deleted inside the same period', () => {
    /* Completed on the 15th, binned on the 20th — the work still happened
       in June, so June still reports it. */
    expect(count([task({ deleted_at: '2026-06-20T10:00:00.000Z' })])).toBe(1)
  })

  it('does not count a task deleted before it was ever completed', () => {
    /* No completed_at means no event to count, deleted or not — this is
       what stops the fix from inflating the number with abandoned work. */
    expect(count([task({ completed_at: null, status: 'open', deleted_at: inJune })])).toBe(0)
  })

  it('still respects the period', () => {
    expect(count([task({ completed_at: inJuly })])).toBe(0)
    expect(count([task({ completed_at: inJuly, deleted_at: inJuly })])).toBe(0)
  })
})

describe('the drill-down list agrees with the number', () => {
  const drill = (tasks) =>
    getDrillRecords('tasksCompleted', START, END, { tasks })

  it('lists the deleted task too', () => {
    /* A count of 1 over an empty list is worse than either — the user taps
       to see WHICH task and finds nothing. */
    const tasks = [task({ id: 'a', title: 'kept' }), task({ id: 'b', title: 'binned', deleted_at: inJuly })]
    expect(count(tasks)).toBe(2)
    expect(drill(tasks).map((r) => r.primary).sort()).toEqual(['binned', 'kept'])
  })

  it('sends a deleted row to the trash, not to a screen it has left', () => {
    expect(drill([task({ deleted_at: inJuly })])[0].navigateTo).toBe('/trash')
    expect(drill([task()])[0].navigateTo).toBe('/tasks')
  })

  it('says on the row that it was deleted', () => {
    /* Otherwise the row looks like a task the user can still find. */
    const [gone] = drill([task({ deleted_at: inJuly })])
    const [kept] = drill([task()])
    expect(gone.secondary).not.toEqual(kept.secondary)
    expect(gone.secondary.length).toBeGreaterThan(kept.secondary.length)
  })
})

describe('openTasksAtEnd keeps its own "as of" semantics', () => {
  /* This metric was already right, and the fix must not have leaked into
     it: a task deleted DURING the period is genuinely not open at the end,
     while one deleted afterwards still was. */
  const open = (tasks) => computeReportForRange(START, END, { tasks }).metrics.openTasksAtEnd
  const pending = (over = {}) => task({ status: 'open', completed_at: null, ...over })

  it('an open task deleted inside the period is not open at the end', () => {
    expect(open([pending({ deleted_at: '2026-06-10T10:00:00.000Z' })])).toBe(0)
  })

  it('an open task deleted after the period still was open at the end', () => {
    expect(open([pending({ deleted_at: inJuly })])).toBe(1)
  })
})
