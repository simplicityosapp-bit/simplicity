/* ════════════════════════════════════════════════════════════════
   ONBOARDING — the flow shrank; nobody gets sent back to the start.
   ════════════════════════════════════════════════════════════════
   Nine steps became four and a close: the file import, the daily
   questions and the recurring expenses moved to the home setup card, and
   the fake "מבט על" preview went entirely.

   `step` is a key stored in the user's preferences. A user parked on one
   of the retired keys would have hit `ONBOARDING_STEPS.indexOf(step)`
   returning -1, been clamped to 0, and been dropped back on step one to
   redo the profile they had already filled in — a silent regression that
   only ever happens to someone mid-flow at the moment of deploy, i.e.
   never in local testing.

   These pin the mapping, and that the raw spreadsheet parse the old flow
   kept in preferences is dropped on read for everyone who still has one.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { migratePreferences, ONBOARDING_STEPS, defaultOnboarding } from '../src/lib/preferences'

const ob = (patch) => migratePreferences({ onboarding: { ...defaultOnboarding(), ...patch } }).onboarding

describe('retired onboarding steps', () => {
  it('resumes each retired step on the one that follows its work', () => {
    expect(ob({ step: 'data_import' }).step).toBe('projects')
    expect(ob({ step: 'daily_questions' }).step).toBe('goals')
    expect(ob({ step: 'recurring' }).step).toBe('goals')
    expect(ob({ step: 'preview' }).step).toBe('goals')
  })

  it('leaves a surviving step exactly where it was', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(ob({ step }).step).toBe(step)
    }
  })

  it('restarts on an unrecognisable step rather than dead-ending', () => {
    expect(ob({ step: 'not-a-step' }).step).toBe(ONBOARDING_STEPS[0])
    expect(ob({ step: null }).step).toBe(ONBOARDING_STEPS[0])
  })

  it('drops retired keys from completed_steps', () => {
    const out = ob({ step: 'goals', completed_steps: ['profile', 'data_import', 'projects', 'daily_questions'] })
    expect(out.completed_steps).toEqual(['profile', 'projects'])
  })

  it('never leaves the user on a step the flow cannot render', () => {
    /* The real hazard: any stored value at all must resolve to a key the
       STEPS map has a component for. */
    for (const step of ['profile', 'data_import', 'projects', 'clients', 'daily_questions', 'goals', 'recurring', 'preview', 'finish', 'nonsense', undefined]) {
      expect(ONBOARDING_STEPS).toContain(ob({ step }).step)
    }
  })
})

describe('the retired spreadsheet parse', () => {
  it('is dropped on read, whatever was stored', () => {
    /* parsed_data held the user's actual client rows — names, phones,
       amounts — kept only so the review wizard could show them. The
       import lives in Settings now and never writes it, but an account
       part-way through the old flow still has one sitting in prefs. */
    const out = migratePreferences({
      onboarding: { ...defaultOnboarding(), step: 'data_import', parsed_data: { kind: 'csv', sheets: [{ id: 's1', rows: [['דנה', '050']] }] } },
    }).onboarding
    expect(out.parsed_data).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain('דנה')
  })

  it('is not reintroduced by the default shape', () => {
    expect(defaultOnboarding()).not.toHaveProperty('parsed_data')
  })
})

describe('answers', () => {
  it('keeps what the surviving steps recorded', () => {
    const out = ob({ answers: { projects: { created_ids: ['p1'] }, clients: { created_ids: ['c1', 'c2'] } } })
    expect(out.answers.projects.created_ids).toEqual(['p1'])
    expect(out.answers.clients.created_ids).toEqual(['c1', 'c2'])
  })

  it('drops the retired steps\' answers', () => {
    /* update() deep-merges and never removes a key, so these would sit in
       the blob forever, read by nothing. */
    const out = ob({
      answers: {
        projects: { created_ids: ['p1'] },
        data_import: { mode: 'A', file_name: 'clients.xlsx' },
        daily_questions: { question_ids: ['q1'] },
        recurring: { created_ids: ['r1'] },
      },
    })
    expect(Object.keys(out.answers).sort()).toEqual(['clients', 'goals', 'profile', 'projects'])
    expect(out.answers.projects.created_ids).toEqual(['p1'])
  })

  it('keeps every step of the current flow addressable', () => {
    /* Each step reads ob.state.answers[<its key>]; a missing key would
       make `initial` undefined and the step lose its resume state. */
    for (const step of ONBOARDING_STEPS.filter((s) => s !== 'finish')) {
      expect(ob({}).answers).toHaveProperty(step)
    }
  })
})
