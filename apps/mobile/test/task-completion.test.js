/* ════════════════════════════════════════════════════════════════
   TASKS — keeping status and completed_at telling the same story.
   ════════════════════════════════════════════════════════════════
   A task can be closed two ways: by the done toggle, which stamps
   completed_at, or by picking a custom status whose meta is "done", which
   writes only status. Reports, the burndown and the client timeline all
   count the TIMESTAMP, so the second path used to produce a task that
   looks finished on screen and does not exist in any count.

   The reverse is the same bug with the sign flipped: reopening a task
   leaves a stale completed_at, and an open task keeps counting as done.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { reconcileCompletion } from '../src/lib/tasks'

afterEach(() => { vi.useRealTimers() })

describe('a task marked done by status alone', () => {
  it('gets the timestamp the counts read', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T09:00:00.000Z'))
    expect(reconcileCompletion({ id: 't1', status: 'done' }).completed_at)
      .toBe('2026-09-08T09:00:00.000Z')
  })

  it('gets one whether the field was absent or explicitly null', () => {
    expect(reconcileCompletion({ status: 'done' }).completed_at).toBeTruthy()
    expect(reconcileCompletion({ status: 'done', completed_at: null }).completed_at).toBeTruthy()
  })

  /* Only a MISSING timestamp is filled in. Restamping one that already
     exists would move a task's completion date every time the row is
     touched, quietly rewriting history in the reports. */
  it('never overwrites a completion time it already has', () => {
    const earlier = '2026-01-01T00:00:00.000Z'
    expect(reconcileCompletion({ status: 'done', completed_at: earlier }).completed_at).toBe(earlier)
  })
})

describe('a task reopened to todo', () => {
  it('has its stale completion time cleared', () => {
    expect(reconcileCompletion({ status: 'todo', completed_at: '2026-01-01T00:00:00.000Z' }).completed_at)
      .toBeNull()
  })

  it('stays clear when there was nothing to clear', () => {
    expect(reconcileCompletion({ status: 'todo' }).completed_at).toBeNull()
  })
})

describe('any other status', () => {
  /* In-progress, blocked, a custom status that is not done — none of
     those is a completion claim either way, so the row passes through
     untouched rather than being guessed at. */
  it('is left exactly as it came', () => {
    const row = { id: 't1', status: 'in_progress', completed_at: null }
    expect(reconcileCompletion(row)).toBe(row)

    const withTime = { id: 't2', status: 'blocked', completed_at: '2026-01-01T00:00:00.000Z' }
    expect(reconcileCompletion(withTime)).toBe(withTime)
  })
})

describe('the row itself', () => {
  it('is copied rather than mutated, so a snapshot the caller holds stays put', () => {
    const row = { id: 't1', status: 'done' }
    const out = reconcileCompletion(row)
    expect(out).not.toBe(row)
    expect(row.completed_at).toBeUndefined()
  })

  it('keeps every other field intact', () => {
    const out = reconcileCompletion({ id: 't1', status: 'done', title: 'call Dana', project_id: 'p1' })
    expect(out).toMatchObject({ id: 't1', title: 'call Dana', project_id: 'p1' })
  })
})
