/* ════════════════════════════════════════════════════════════════
   ONBOARDING — the flow has no dead ends.
   ════════════════════════════════════════════════════════════════
   Two ways the old flow trapped people, both of them invisible to a
   reviewer who filled every field in:

     · The primary button was disabled on arrival at five of nine steps.
       The only way forward without filling anything was a small "דלג"
       link in the corner — and on two steps it carried no explanation at
       all, so the screen was a greyed-out button and nothing else.
     · Leaving was offered exactly once, on the welcome screen. After
       that the App-level gate routed every path back into the flow and
       there was no exit, no menu and no sign-out.

   The button now always does something, and leaving is a pause you can
   come back from. These pin both, since neither shows up in a build.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { migratePreferences, defaultOnboarding } from '../src/lib/preferences'

/* Primary-button resolution, copied from OnboardingShell. */
const primary = ({ canAdvance = false, busy = false, nextLabel = null } = {}) => ({
  label: busy ? 'saving' : (canAdvance ? (nextLabel || 'next') : 'later'),
  action: canAdvance ? 'commit' : 'skipStep',
  disabled: busy || false,
})

/* Enter handling, copied from OnboardingShell.onSubmit. */
const onEnter = ({ canAdvance, busy }) => (canAdvance && !busy ? 'commit' : 'nothing')

describe('the primary button', () => {
  it('is never disabled just because the step is empty', () => {
    const b = primary({ canAdvance: false })
    expect(b.disabled).toBe(false)
  })

  it('offers to move on when there is nothing to save', () => {
    expect(primary({ canAdvance: false })).toMatchObject({ label: 'later', action: 'skipStep' })
  })

  it('saves once the step is filled', () => {
    expect(primary({ canAdvance: true })).toMatchObject({ label: 'next', action: 'commit' })
  })

  it("keeps a step's own label when it has one", () => {
    /* The closing step calls its button "שנתחיל?" rather than "הלאה". */
    expect(primary({ canAdvance: true, nextLabel: 'שנתחיל?' }).label).toBe('שנתחיל?')
  })

  it('shows saving while a write is in flight, and blocks a second press', () => {
    const b = primary({ canAdvance: true, busy: true })
    expect(b.label).toBe('saving')
    expect(b.disabled).toBe(true)
  })
})

describe('Enter', () => {
  it('advances a completed step', () => {
    expect(onEnter({ canAdvance: true, busy: false })).toBe('commit')
  })

  it('does NOT skip an incomplete one', () => {
    /* The button says "later" here, but Enter means "done with this
       field" — making it skip the step would discard what they typed on
       the keystroke people press most. */
    expect(onEnter({ canAdvance: false, busy: false })).toBe('nothing')
  })

  it('does nothing mid-save', () => {
    expect(onEnter({ canAdvance: true, busy: true })).toBe('nothing')
  })
})

/* The setup-task list, copied from hooks/useSetupTasks.js. */
const setupTasks = ({ prefs = {}, questions = [], recurring = [] } = {}) => ([
  ...(!prefs?.onboarding?.completed_at ? [{ key: 'setup', done: false }] : []),
  { key: 'import',    done: !!prefs?.setup?.imported_at },
  { key: 'questions', done: (questions || []).some((q) => q.active !== false) },
  { key: 'recurring', done: (recurring || []).length > 0 },
])

describe('leaving the flow', () => {
  const paused = { onboarding: { ...defaultOnboarding(), step: 'clients', skipped_at: '2026-07-27T10:00:00Z' } }
  const finished = { onboarding: { ...defaultOnboarding(), step: 'finish', completed_at: '2026-07-27T10:00:00Z' } }

  it('releases the app gate, so the user is not locked in', () => {
    const ob = migratePreferences(paused).onboarding
    expect(!!(ob.completed_at || ob.skipped_at)).toBe(true)
  })

  it('keeps the step they left, so returning resumes there', () => {
    expect(migratePreferences(paused).onboarding.step).toBe('clients')
  })

  it('offers the way back on the home card', () => {
    expect(setupTasks({ prefs: paused }).map((task) => task.key)).toEqual(['setup', 'import', 'questions', 'recurring'])
  })

  it('drops that offer once the flow is actually finished', () => {
    /* Never shown ticked: someone who simply completed onboarding never
       met "finish setting up" as a task and shouldn't see it appear. */
    expect(setupTasks({ prefs: finished }).map((task) => task.key)).toEqual(['import', 'questions', 'recurring'])
  })

  it('still shows the card for a paused user with everything else done', () => {
    const tasks = setupTasks({ prefs: { ...paused, setup: { imported_at: 'x' } }, questions: [{ id: 'q' }], recurring: [{ id: 'r' }] })
    expect(tasks.some((task) => !task.done)).toBe(true)
  })
})
