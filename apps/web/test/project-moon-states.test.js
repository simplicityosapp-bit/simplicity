/* ════════════════════════════════════════════════════════════════
   THE RING HAS THREE STATES, NOT TWO.
   ════════════════════════════════════════════════════════════════
   moonGetData returns `overall: null` whenever no goal is LIVE — and that
   covers two situations a coach experiences very differently:

     · the project has no goals at all
     · the project HAS goals and every one of them has ended

   A goal closes on its target DATE, not on reaching 100% (see the note in
   domain/moon.ts), so the second case is ordinary: a quarter finishes and
   the ring goes quiet. Offering "set a goal for this project" there is a
   false statement — there ARE goals, they are simply over — and it sends
   the coach to create a duplicate instead of extending the one they have.

   moonGetData has always handed `ended` back separately for exactly this.
   Nothing consumed it until now.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { moonGetData } from '@simplicity/core'
import i18n, { initI18n, loadLanguage } from '@simplicity/core/i18n'

const src = readFileSync(new URL('../src/screens/project-detail/ProjectMoonRing.jsx', import.meta.url), 'utf8')

const NOW = new Date('2026-08-25T12:00:00.000Z')
const day = (offset) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

const CATEGORIES = [{ id: 'cat1', name: 'הכנסות', color: '#8BA888', metric: 'manual' }]
const goal = (over) => ({
  id: Math.random().toString(16).slice(2),
  category_id: 'cat1',
  parent_goal_id: null,
  project_id: 'p1',
  label: 'goal',
  time_frame: 'deadline',
  target_value: 10,
  target_date: day(30),
  importance: 3,
  tracking_method: 'manual',
  measurement_type: 'manual',
  manual_input_type: 'number',
  ...over,
})

const run = (goals) => moonGetData(NOW, { goals, categories: CATEGORIES, entries: [] })

describe('what moonGetData reports for each state', () => {
  it('no goals at all → no overall and nothing ended', () => {
    const { overall, ended } = run([])
    expect(overall).toBeNull()
    expect(ended).toHaveLength(0)
  })

  it('a goal past its target date → no overall, but it IS reported as ended', () => {
    const { overall, ended, scored } = run([goal({ target_date: day(-1) })])
    expect(overall).toBeNull()
    expect(scored).toHaveLength(0)
    expect(ended.length).toBeGreaterThan(0)
  })

  it('a live goal → an overall', () => {
    const { overall } = run([goal({ target_date: day(30) })])
    expect(overall).not.toBeNull()
  })

  /* The two null-overall cases are distinguishable ONLY by `ended`. */
  it('the two quiet states differ only in `ended`', () => {
    const none = run([])
    const over = run([goal({ target_date: day(-1) })])
    expect(none.overall).toBe(over.overall)      // both null
    expect(none.ended.length).toBe(0)
    expect(over.ended.length).toBeGreaterThan(0)
  })
})

describe('the component branches on it', () => {
  it('reads `ended` out of moonGetData', () => {
    expect(src).toMatch(/const \{ overall, scored, ended \} = useMemo\(\(\) => moonGetData/)
  })

  it('checks the ended case BEFORE the no-goals case', () => {
    /* Order matters: `!overall` is true in both, so a bare `if (!overall)`
       first would swallow the ended state and show the invitation. */
    const endedAt = src.indexOf('if (!overall && ended.length > 0)')
    const noneAt = src.indexOf('if (!overall) {')
    expect(endedAt).toBeGreaterThan(-1)
    expect(noneAt).toBeGreaterThan(-1)
    expect(endedAt).toBeLessThan(noneAt)
  })

  it('the ended chip does not offer to create a goal', () => {
    const block = src.slice(
      src.indexOf('if (!overall && ended.length > 0)'),
      src.indexOf('if (!overall) {'),
    )
    expect(block).toMatch(/detail\.moon\.ended/)
    expect(block).toMatch(/navigate\(ROUTES\.GOALS\)/)
    expect(block).not.toMatch(/addGoal|AddGoalModal|detail\.moon\.addGoal/)
  })

  it('the ended chip wears the shared empty-chip styling', () => {
    expect(src).toMatch(/className="moon-chip moon-chip-empty pd-moon-chip"/)
  })

  it('the no-goals chip still offers the prefilled form', () => {
    const block = src.slice(src.indexOf('if (!overall) {'))
    expect(block).toMatch(/detail\.moon\.addGoal/)
    expect(block).toMatch(/initialProject=\{projectId\}/)
  })
})

describe('the copy counts properly in every language', () => {
  beforeAll(async () => {
    await initI18n({ lng: 'he' })
    await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
  })

  it('has singular and plural for the ended label', () => {
    for (const lng of ['he', 'en', 'es', 'fr']) {
      const t = i18n.getFixedT(lng, 'projects')
      for (const key of ['detail.moon.ended', 'detail.moon.endedAria']) {
        expect(t(key, { count: 1 }), `${lng}:${key}:1`).not.toBe(key)
        expect(t(key, { count: 3 }), `${lng}:${key}:3`).not.toBe(key)
      }
      /* One goal must not read "1 goals". */
      expect(t('detail.moon.ended', { count: 1 })).not.toMatch(/\b1\b/)
    }
  })

  it('Hebrew uses its dual for two', () => {
    const t = i18n.getFixedT('he', 'projects')
    expect(t('detail.moon.ended', { count: 2 })).toBeTruthy()
    expect(t('detail.moon.ended', { count: 2 })).not.toBe('detail.moon.ended')
  })
})
