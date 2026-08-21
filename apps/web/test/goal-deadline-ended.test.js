/* ════════════════════════════════════════════════════════════════
   A GOAL WITH A DEADLINE ACTUALLY ENDS.

   `goals.target_date` was written by the goal form and printed on the card
   as "עד 12/09" — and then no code read it again. A one-off goal therefore
   stayed on the goals screen for ever, and, worse, kept its full importance
   weight in the מבט על score: goalPeriod already clamped its window to the
   target date, so past that point elapsedFraction pinned to 1, paced froze
   at pure, and the goal dragged the overall number with a result that could
   never change again.

   The rules pinned here, all of them easy to lose in a later tidy-up:

   1. Only a DEADLINE goal ends. Monthly and weekly ones roll into a fresh
      period — that is the whole point of them.
   2. Reaching the target early does NOT end a goal (owner decision
      2026-08-21). The date is the only thing that closes one.
   3. An ended goal leaves `scored` and the overall score, but comes back in
      `ended` so the goals screen — the record — can still show it, tagged.
   4. With nothing live left, `overall` is null. NOT zero: "you are at 0%"
      is a claim about a period in which there was nothing left to measure.
   5. goalsByCategory keeps an ended goal in its ORIGINAL position rather
      than sweeping it to the bottom of its category.
   6. The trend gets the per-day rule for free — a goal counts on the days
      before its deadline and stops after, because moonTrend scores each day
      by calling moonGetData with that day as "now".

   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { isGoalEnded, moonGetData, moonTrend, goalsByCategory } from '@simplicity/core'

const now = new Date(2026, 7, 21, 14, 0, 0) // Fri 2026-08-21, 14:00 local
const day = (d) => `2026-08-${String(d).padStart(2, '0')}`

const cat = { id: 'c1', name: 'אחר', measurement_type: 'manual' }
const goal = (id, over) => ({
  id,
  category_id: 'c1',
  time_frame: 'deadline',
  target_value: 10,
  importance: 3,
  created_at: '2026-07-01T09:00:00.000Z',
  ...over,
})
/* One entry worth 4 of the target 10, dated well inside every window below. */
const entry = (goalId) => ({ id: `e-${goalId}`, category_id: 'c1', goal_id: goalId, date: day(2), value: 4 })

const build = (goals) => ({ goals, categories: [cat], entries: goals.map((g) => entry(g.id)) })

describe('isGoalEnded — what closes a goal', () => {
  it('ends a deadline goal the day after its target date', () => {
    expect(isGoalEnded(goal('a', { target_date: day(20) }), now)).toBe(true)
  })

  it('does NOT end one whose target date is today — the last day is a whole day', () => {
    expect(isGoalEnded(goal('a', { target_date: day(21) }), now)).toBe(false)
  })

  it('does not end a future deadline', () => {
    expect(isGoalEnded(goal('a', { target_date: day(30) }), now)).toBe(false)
  })

  it('never ends a monthly or weekly goal — they roll into a new period', () => {
    expect(isGoalEnded(goal('a', { time_frame: 'monthly', target_date: day(1) }), now)).toBe(false)
    expect(isGoalEnded(goal('a', { time_frame: 'weekly', target_date: day(1) }), now)).toBe(false)
  })

  it('never ends a deadline goal that carries no date', () => {
    expect(isGoalEnded(goal('a', { target_date: null }), now)).toBe(false)
    expect(isGoalEnded(goal('a', {}), now)).toBe(false)
  })

  it('does not close a goal that hit its target early — only the date closes one', () => {
    /* target_value 1 against an entry of 4: comfortably past 100%, deadline
       still ahead. Owner decision 2026-08-21. */
    const g = goal('a', { target_date: day(30), target_value: 1 })
    expect(isGoalEnded(g, now)).toBe(false)
    const { scored, ended } = moonGetData(now, build([g]))
    expect(ended).toHaveLength(0)
    expect(scored).toHaveLength(1)
    expect(scored[0].pure).toBeGreaterThanOrEqual(100)
  })
})

describe('moonGetData — the score drops a goal that is over', () => {
  it('splits the live set from the finished one', () => {
    const live = goal('live', { target_date: day(30) })
    const over = goal('over', { target_date: day(10) })
    const { scored, ended } = moonGetData(now, build([live, over]))
    expect(scored.map((s) => s.goal.id)).toEqual(['live'])
    expect(ended.map((s) => s.goal.id)).toEqual(['over'])
  })

  it('flags what it hands back as ended, so a card can say so', () => {
    const { ended } = moonGetData(now, build([goal('over', { target_date: day(10) })]))
    expect(ended[0].ended).toBe(true)
  })

  it('leaves the finished goal out of the overall score entirely', () => {
    /* Both goals sit at 4/10. Adding a finished one must not move the number
       the live one produces — that is the drag this fixes. */
    const live = goal('live', { target_date: day(30) })
    const alone = moonGetData(now, build([live]))
    const withDead = moonGetData(now, build([live, goal('over', { target_date: day(10), importance: 5 })]))
    expect(withDead.overall).toEqual(alone.overall)
  })

  it('reports NO score at all when every goal has ended — null, not zero', () => {
    const { overall, scored, ended } = moonGetData(now, build([goal('over', { target_date: day(10) })]))
    expect(overall).toBe(null)
    expect(scored).toHaveLength(0)
    expect(ended).toHaveLength(1)
  })

  it('still reports null with no goals at all, and an empty ended list', () => {
    const { overall, scored, ended } = moonGetData(now, { goals: [], categories: [cat], entries: [] })
    expect(overall).toBe(null)
    expect(scored).toEqual([])
    expect(ended).toEqual([])
  })
})

describe('goalsByCategory — the goals screen keeps the record', () => {
  it('still lists a finished goal, unlike every other reader of the engine', () => {
    const groups = goalsByCategory(now, build([goal('over', { target_date: day(10) })]))
    expect(groups).toHaveLength(1)
    expect(groups[0].goals.map((s) => s.goal.id)).toEqual(['over'])
    expect(groups[0].goals[0].ended).toBe(true)
  })

  it('keeps it in its ORIGINAL position, not swept to the bottom', () => {
    const goals = [
      goal('first-live', { target_date: day(30) }),
      goal('middle-over', { target_date: day(10) }),
      goal('last-live', { target_date: day(29) }),
    ]
    const groups = goalsByCategory(now, build(goals))
    expect(groups[0].goals.map((s) => s.goal.id))
      .toEqual(['first-live', 'middle-over', 'last-live'])
  })
})

describe('moonTrend — a goal counts on the days it was still running', () => {
  it('scores the days before the deadline and goes blank after it', () => {
    /* Deadline 2026-08-18, so the 19th onward has no live goal left. */
    const data = build([goal('over', { target_date: day(18) })])
    const trend = moonTrend(10, now, data)
    const on = (d) => trend.find((p) => p.date.getDate() === d)
    expect(on(17).score).not.toBe(null)
    expect(on(18).score).not.toBe(null)
    expect(on(19).score).toBe(null)
    expect(on(21).score).toBe(null)
  })

  it('does not blank a day just because a LATER goal is still running', () => {
    const data = build([
      goal('over', { target_date: day(18) }),
      goal('live', { target_date: day(30) }),
    ])
    const trend = moonTrend(10, now, data)
    for (const point of trend) expect(point.score).not.toBe(null)
  })
})
