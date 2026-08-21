/* ════════════════════════════════════════════════════════════════
   MANUAL PROGRESS BELONGS TO ONE GOAL (migration 0110).
   ════════════════════════════════════════════════════════════════
   Every manual goal in an account resolves to ONE shared category
   (lib/goalPresets → MANUAL_CATEGORY), and the scoring engine summed a
   CATEGORY's entries into every goal in it. Two manual goals were therefore the
   same goal as far as progress went: logging 3 toward "5 blog posts" moved
   "10 sales calls" to 3/10 too, with a shared history list, and the מבט על ring
   counted that one number twice. Reproduced in the running app before the fix.

   An entry that names its goal now counts for that goal alone. An entry with no
   goal_id predates the migration, which refused to attribute it without
   guessing — it keeps the old behaviour so nobody's existing numbers move.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { moonGetData } from '@simplicity/core'

const CAT = { id: 'shared-manual', measurement_type: 'manual', graph_type: 'sum', name: 'אישי' }
const goal = (id, target) => ({
  id, category_id: CAT.id, time_frame: 'monthly', target_value: target,
  importance: 3, created_at: '2026-08-01T00:00:00.000Z',
})
const entry = (over) => ({ category_id: CAT.id, date: '2026-08-10', value: 3, ...over })
const NOW = new Date('2026-08-20T12:00:00')

const actualFor = (goals, entries, id) => {
  const { scored } = moonGetData(NOW, { goals, categories: [CAT], entries })
  return scored.find((s) => s.goal.id === id)?.actual
}

describe('an entry counts for the goal it names', () => {
  const posts = goal('posts', 5)
  const calls = goal('calls', 10)

  it('does NOT leak into the other goal in the same bucket', () => {
    /* The regression, stated exactly as it was reproduced. */
    const entries = [entry({ goal_id: 'posts' })]
    expect(actualFor([posts, calls], entries, 'posts')).toBe(3)
    expect(actualFor([posts, calls], entries, 'calls')).toBe(0)
  })

  it('keeps two goals independent when both are logged', () => {
    const entries = [entry({ goal_id: 'posts', value: 3 }), entry({ goal_id: 'calls', value: 7 })]
    expect(actualFor([posts, calls], entries, 'posts')).toBe(3)
    expect(actualFor([posts, calls], entries, 'calls')).toBe(7)
  })

  it('ignores an entry naming a goal that is not this one, even in-category', () => {
    const entries = [entry({ goal_id: 'someone-else' })]
    expect(actualFor([posts, calls], entries, 'posts')).toBe(0)
  })
})

describe('a pre-0110 entry keeps the behaviour it had', () => {
  const posts = goal('posts', 5)
  const calls = goal('calls', 10)

  it('still counts for every goal in its category', () => {
    /* The migration only attributes an entry whose category holds exactly one
       live goal. Anything it could not attribute stays NULL rather than being
       assigned to a goal the coach never meant — so it must keep scoring the
       old way, not silently drop to zero. */
    const entries = [entry({ goal_id: null })]
    expect(actualFor([posts, calls], entries, 'posts')).toBe(3)
    expect(actualFor([posts, calls], entries, 'calls')).toBe(3)
  })

  it('adds on top of an attributed entry for the goal that has one', () => {
    const entries = [entry({ goal_id: null, value: 3 }), entry({ goal_id: 'posts', value: 2 })]
    expect(actualFor([posts, calls], entries, 'posts')).toBe(5)
    expect(actualFor([posts, calls], entries, 'calls')).toBe(3)
  })

  it('treats a missing goal_id key the same as an explicit null', () => {
    const { category_id, date, value } = entry({})
    expect(actualFor([posts, calls], [{ category_id, date, value }], 'calls')).toBe(3)
  })
})
