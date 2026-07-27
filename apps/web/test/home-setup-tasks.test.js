/* ════════════════════════════════════════════════════════════════
   HOME — the setup card empties itself, and then leaves.
   ════════════════════════════════════════════════════════════════
   Three things onboarding used to demand up front — importing a file,
   choosing daily questions, entering fixed expenses — now wait on the
   home card. A task that stayed ticked-off-able only by hand would be a
   chore of its own, so each reports done from the data.

   The card's whole reason to disappear rests on these three signals, so
   they are what's pinned. The import is the odd one: an imported client
   is indistinguishable from a typed one, so Settings records the act
   instead — which means "has clients" must NOT be mistaken for it.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'

/* Copied from hooks/useSetupTasks.js — the hook pulls three data hooks
   this DOM-less suite can't mount (see empty-states.test.js). */
const setupTasks = ({ prefs = {}, questions = [], recurring = [] } = {}) => ([
  { key: 'import',    done: !!prefs?.setup?.imported_at },
  { key: 'questions', done: (questions || []).some((q) => q.active !== false) },
  { key: 'recurring', done: (recurring || []).length > 0 },
])

const doneOf = (tasks, key) => tasks.find((task) => task.key === key).done
const cardShows = (tasks, prefs = {}) => tasks.some((task) => !task.done) && !prefs.homeWelcomeDismissed

describe('setup task signals', () => {
  it('starts with all three outstanding on a fresh account', () => {
    const tasks = setupTasks()
    expect(tasks.every((task) => !task.done)).toBe(true)
    expect(cardShows(tasks)).toBe(true)
  })

  it('ticks the import off the recorded act, not off having clients', () => {
    /* Imported clients look exactly like typed ones. Onboarding creates a
       client, so any has-clients test would tick this for everybody on
       their first visit. */
    expect(doneOf(setupTasks({ prefs: {} }), 'import')).toBe(false)
    expect(doneOf(setupTasks({ prefs: { setup: { imported_at: '2026-07-27T10:00:00Z' } } }), 'import')).toBe(true)
  })

  it('ticks the questions off an active question only', () => {
    expect(doneOf(setupTasks({ questions: [] }), 'questions')).toBe(false)
    expect(doneOf(setupTasks({ questions: [{ id: 'q', active: false }] }), 'questions')).toBe(false)
    expect(doneOf(setupTasks({ questions: [{ id: 'q', active: true }] }), 'questions')).toBe(true)
    /* Rows written without the flag are active — the column defaults true. */
    expect(doneOf(setupTasks({ questions: [{ id: 'q' }] }), 'questions')).toBe(true)
  })

  it('ticks the recurring off any template', () => {
    expect(doneOf(setupTasks({ recurring: [] }), 'recurring')).toBe(false)
    expect(doneOf(setupTasks({ recurring: [{ id: 'r' }] }), 'recurring')).toBe(true)
  })
})

describe('when the card shows', () => {
  it('retires itself once all three are done', () => {
    const tasks = setupTasks({
      prefs: { setup: { imported_at: 'x' } },
      questions: [{ id: 'q', active: true }],
      recurring: [{ id: 'r' }],
    })
    expect(cardShows(tasks)).toBe(false)
  })

  it('stays while even one is outstanding', () => {
    const tasks = setupTasks({ prefs: { setup: { imported_at: 'x' } }, questions: [{ id: 'q' }] })
    expect(cardShows(tasks)).toBe(true)
  })

  it('stays gone once dismissed, however much is outstanding', () => {
    expect(cardShows(setupTasks(), { homeWelcomeDismissed: true })).toBe(false)
  })
})
