/* The home setup card's signals, shared by both apps. The phone used to have
   no card at all; these are the rules that decide when it empties and leaves. */
import { describe, it, expect } from 'vitest'
import { setupTasks, showSetupCard } from '../src/domain/setupTasks'

const doneOf = (tasks: ReturnType<typeof setupTasks>, key: string) => tasks.find((t) => t.key === key)?.done

describe('setupTasks', () => {
  it('starts with everything outstanding, the intro first', () => {
    const tasks = setupTasks()
    expect(tasks.map((t) => t.key)).toEqual(['setup', 'import', 'questions', 'recurring'])
    expect(tasks.every((t) => !t.done)).toBe(true)
    expect(tasks[0].started).toBe(false)
  })

  it('resumes a started intro and drops it once completed', () => {
    expect(setupTasks({ prefs: { onboarding: { started_at: 'x' } } })[0]).toEqual({ key: 'setup', done: false, started: true })
    expect(setupTasks({ prefs: { onboarding: { completed_at: 'x' } } }).map((t) => t.key)).not.toContain('setup')
  })

  it('ticks the import off the recorded act, not off having clients', () => {
    expect(doneOf(setupTasks({ prefs: {} }), 'import')).toBe(false)
    expect(doneOf(setupTasks({ prefs: { setup: { imported_at: '2026-07-27T10:00:00Z' } } }), 'import')).toBe(true)
  })

  it('ticks the questions off an active question only', () => {
    expect(doneOf(setupTasks({ questions: [{ active: false }] }), 'questions')).toBe(false)
    expect(doneOf(setupTasks({ questions: [{ active: true }] }), 'questions')).toBe(true)
    expect(doneOf(setupTasks({ questions: [{}] }), 'questions')).toBe(true)
  })

  it('ticks the recurring off any template', () => {
    expect(doneOf(setupTasks({ recurring: [] }), 'recurring')).toBe(false)
    expect(doneOf(setupTasks({ recurring: [{ id: 'r' }] }), 'recurring')).toBe(true)
  })
})

describe('showSetupCard', () => {
  const allDone = setupTasks({
    prefs: { onboarding: { completed_at: 'x' }, setup: { imported_at: 'x' } },
    questions: [{ active: true }],
    recurring: [{}],
  })

  it('retires once everything is done, stays while one is outstanding', () => {
    expect(showSetupCard(allDone)).toBe(false)
    expect(showSetupCard(setupTasks({ prefs: { onboarding: { completed_at: 'x' } } }))).toBe(true)
  })

  it('stays gone once dismissed', () => {
    expect(showSetupCard(setupTasks(), { homeWelcomeDismissed: true })).toBe(false)
  })
})
