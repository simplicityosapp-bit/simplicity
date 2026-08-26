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

describe('home draws the same three states', () => {
  const home = readFileSync(
    new URL('../src/screens/home/widgets/MoonWidget.jsx', import.meta.url), 'utf8',
  )

  it('reads `ended` and branches on it before the no-goals case', () => {
    expect(home).toMatch(/const \{ overall, scored, ended \} = useMemo\(\(\) => moonGetData/)
    const endedAt = home.indexOf('if (!hasGoals && ended.length > 0)')
    const noneAt = home.indexOf('if (!hasGoals) {')
    expect(endedAt).toBeGreaterThan(-1)
    expect(endedAt).toBeLessThan(noneAt)
  })

  it('the ended chip does not offer to set a goal', () => {
    const block = home.slice(
      home.indexOf('if (!hasGoals && ended.length > 0)'),
      home.indexOf('if (!hasGoals) {'),
    )
    expect(block).toMatch(/widgets\.moon\.ended/)
    expect(block).not.toMatch(/setGoal/)
  })

  it('both quiet chips can be activated from the keyboard', () => {
    /* They are role="button" divs, so Enter/Space need wiring by hand — the
       invitation chip could be tabbed to but not activated at all.

       Each block is isolated by its own aria-label rather than by slicing to
       a line-ending-sensitive marker: the file is CRLF and an indexOf on a
       '\n' literal silently returns -1, which turns slice() into "the rest of
       the file" and the assertion into one that cannot fail. */
    const blocks = [
      /aria-label=\{t\('widgets\.moon\.endedAria'/,
      /aria-label=\{t\('widgets\.moon\.setGoalAria'\)\}/,
    ].map((re) => {
      const at = home.search(re)
      expect(at, `block not found: ${re}`).toBeGreaterThan(-1)
      /* Walk back to the opening <Box of that element. */
      return home.slice(home.lastIndexOf('<Box', at), at)
    })
    for (const b of blocks) expect(b).toMatch(/onKeyDown=/)
    /* And nothing else in the file grew a stray handler. */
    expect((home.match(/onKeyDown=/g) || []).length).toBe(2)
  })
})

describe('the copy counts properly in every language', () => {
  beforeAll(async () => {
    await initI18n({ lng: 'he' })
    await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
  })

  it('has singular and plural for the ended label, on both screens', () => {
    for (const lng of ['he', 'en', 'es', 'fr']) {
      const tp = i18n.getFixedT(lng, 'projects')
      const th = i18n.getFixedT(lng, 'home')
      for (const [t, key] of [
        [tp, 'detail.moon.ended'], [tp, 'detail.moon.endedAria'],
        [th, 'widgets.moon.ended'], [th, 'widgets.moon.endedAria'],
      ]) {
        expect(t(key, { count: 1 }), `${lng}:${key}:1`).not.toBe(key)
        expect(t(key, { count: 3 }), `${lng}:${key}:3`).not.toBe(key)
      }
      /* One goal must not read "1 goals". */
      expect(tp('detail.moon.ended', { count: 1 })).not.toMatch(/\b1\b/)
      expect(th('widgets.moon.ended', { count: 1 })).not.toMatch(/\b1\b/)
    }
  })

  it('Hebrew uses its dual for two', () => {
    for (const [ns, key] of [['projects', 'detail.moon.ended'], ['home', 'widgets.moon.ended']]) {
      const t = i18n.getFixedT('he', ns)
      expect(t(key, { count: 2 }), `${ns}:${key}`).not.toBe(key)
    }
  })
})
