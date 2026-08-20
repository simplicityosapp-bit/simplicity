/* ════════════════════════════════════════════════════════════════
   מבט על — the 30-day line may only show days that happened.
   ════════════════════════════════════════════════════════════════
   moonTrend reconstructs each past day by re-scoring "as of" that day. It did
   so with TODAY's goals, so a coach who set their first goal this morning was
   drawn a full month of history they never lived, and every later goal was
   back-dated onto weeks it had not existed in. A day before a goal existed now
   has no score at all — null, a gap — rather than 0, which is its own false
   claim about a stretch where there was simply nothing to measure.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { moonTrend } from '@simplicity/core'

const NOW = new Date('2026-08-20T12:00:00')
const iso = (daysAgo) => new Date(NOW.getTime() - daysAgo * 86400000).toISOString()

const CAT = { id: 'c1', measurement_type: 'manual', graph_type: 'sum' }
/* A second, untouched category — manual entries are summed per CATEGORY, so a
   goal sharing c1 would inherit c1's progress instead of standing at zero. */
const CAT2 = { id: 'c2', measurement_type: 'manual', graph_type: 'sum' }
const goal = (createdDaysAgo) => ({
  id: 'g' + createdDaysAgo, category_id: 'c1', time_frame: 'monthly',
  target_value: 10, importance: 3, created_at: iso(createdDaysAgo),
})
const run = (goals, entries = []) => moonTrend(30, NOW, { goals, categories: [CAT, CAT2], entries })

describe('the trend line only covers days the goal existed', () => {
  it('leaves a gap before the goal was created', () => {
    const t = run([goal(9)])
    expect(t).toHaveLength(30)
    /* index 29 is today, so the goal's 10th-from-last day is index 21. */
    expect(t.slice(0, 20).every((p) => p.score === null)).toBe(true)
    expect(t[29].score).not.toBeNull()
  })

  it('reports a gap as null, never as a zero score', () => {
    /* The distinction the chart depends on: "nothing to measure" is not the
       same statement as "you scored 0%", and a 0 draws a real line. */
    const t = run([goal(3)])
    const early = t.slice(0, 20)
    expect(early.every((p) => p.score === null)).toBe(true)
    expect(early.some((p) => p.score === 0)).toBe(false)
  })

  it('gives a goal created today exactly one scored day', () => {
    const t = run([goal(0)])
    expect(t.filter((p) => p.score !== null)).toHaveLength(1)
  })

  it('does not back-date a second goal onto the weeks before it existed', () => {
    /* The old goal is fully met (entry 10 against target 10 → 100%). A second,
       untouched goal would halve the weighted average if it were back-dated,
       so an unchanged 100 on a day before it existed is the real assertion.
       Index 20 is 9 days ago; the new goal is 1 day old. */
    const entries = [{ category_id: 'c1', date: '2026-08-05', value: 10 }]
    const oldOnly = run([goal(25)], entries)
    const both = run([goal(25), { ...goal(1), id: 'gNew', category_id: 'c2' }], entries)
    expect(oldOnly[20].score).toBe(100)
    expect(both[20].score).toBe(100)
    /* Today, where the new goal DOES exist, it correctly drags the score down. */
    expect(both[29].score).toBeLessThan(oldOnly[29].score)
  })

  it('counts a goal with no created_at — we cannot prove it did not exist', () => {
    const t = moonTrend(30, NOW, { goals: [{ ...goal(0), created_at: null }], categories: [CAT], entries: [] })
    expect(t.every((p) => p.score !== null)).toBe(true)
  })

  it('scores today at `now`, not at the end of today', () => {
    /* Pace divides by the fraction of the period elapsed, so end-of-day
       late-dates it and undercuts the live ring. Same data, one hour later in
       the month, must not score HIGHER at the later instant. */
    const entries = [{ category_id: 'c1', date: '2026-08-10', value: 5 }]
    const early = moonTrend(30, new Date('2026-08-20T08:00:00'), { goals: [goal(20)], categories: [CAT], entries })
    const late = moonTrend(30, new Date('2026-08-20T22:00:00'), { goals: [goal(20)], categories: [CAT], entries })
    expect(late[29].score).toBeLessThanOrEqual(early[29].score)
  })
})
