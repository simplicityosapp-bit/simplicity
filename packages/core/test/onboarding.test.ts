/* ════════════════════════════════════════════════════════════════
   ONBOARDING STATE MACHINE — the first tests this logic has ever had.
   ════════════════════════════════════════════════════════════════
   apps/web pinned the migration through three test files, but the
   transitions themselves (advance / skip / back / goTo) were only ever
   exercised by hand in a browser — and they cannot be exercised in the
   preview at all, because the preview mock does not persist onboarding
   writes. That gap is why three bugs reached users.

   The sharpest tests here are the "patch carries nothing else" ones.
   Persistence deep-merges a patch over the LATEST preferences, so any
   key a transition returns without meaning to will overwrite a newer
   value. A patch that quietly grew an `answers` key is precisely the bug
   that orphaned created_ids and duplicated the user's project, client
   and goal on Back then Next — invisible in a type, caught here.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import {
  ONBOARDING_STEPS,
  defaultOnboarding,
  migrateOnboarding,
  isOnboardingComplete,
  onboardingStepIndex,
  onboardingProgress,
  markStartedPatch,
  setAnswersPatch,
  advancePatch,
  skipStepPatch,
  backPatch,
  goToPatch,
  skipAllPatch,
  completePatch,
  seeWelcomePatch,
  type OnboardingState,
} from '../src/domain/onboarding'

const NOW = '2026-09-08T09:00:00.000Z'
const EARLIER = '2026-09-01T07:00:00.000Z'

const state = (patch: Partial<OnboardingState> = {}): OnboardingState => ({
  ...defaultOnboarding(),
  ...patch,
})

describe('migrateOnboarding', () => {
  it('returns the default for anything that is not an object', () => {
    for (const input of [null, undefined, 'x', 7, true]) {
      expect(migrateOnboarding(input)).toEqual(defaultOnboarding())
    }
  })

  it('resumes a retired step on the step that followed its work', () => {
    expect(migrateOnboarding({ step: 'data_import' }).step).toBe('projects')
    expect(migrateOnboarding({ step: 'daily_questions' }).step).toBe('goals')
    expect(migrateOnboarding({ step: 'recurring' }).step).toBe('goals')
    expect(migrateOnboarding({ step: 'preview' }).step).toBe('goals')
  })

  it('restarts rather than dead-ends on a step it does not recognise', () => {
    expect(migrateOnboarding({ step: 'not-a-step' }).step).toBe(ONBOARDING_STEPS[0])
    expect(migrateOnboarding({ step: null }).step).toBe(ONBOARDING_STEPS[0])
  })

  it('keeps every live step untouched', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(migrateOnboarding({ step }).step).toBe(step)
    }
  })

  it('drops completed_steps that no longer exist, and a non-array outright', () => {
    expect(migrateOnboarding({ completed_steps: ['profile', 'recurring', 'goals'] }).completed_steps)
      .toEqual(['profile', 'goals'])
    expect(migrateOnboarding({ completed_steps: 'nope' }).completed_steps).toEqual([])
  })

  it('drops answers belonging to retired steps, since a merge would keep them forever', () => {
    const out = migrateOnboarding({
      answers: { profile: { name: 'דנה', role: null }, daily_questions: { x: 1 } },
    })
    expect(Object.keys(out.answers).sort()).toEqual(['clients', 'goals', 'profile', 'projects'])
    expect(out.answers.profile.name).toBe('דנה')
  })

  it('never carries a spreadsheet parse back out — it held real client data', () => {
    const out = migrateOnboarding({ step: 'projects', parsed_data: { rows: [['דנה', '050']] } })
    expect(out).not.toHaveProperty('parsed_data')
    expect(defaultOnboarding()).not.toHaveProperty('parsed_data')
  })
})

describe('reading the flow', () => {
  it('counts a flow complete on either exit', () => {
    expect(isOnboardingComplete(state())).toBe(false)
    expect(isOnboardingComplete(state({ completed_at: NOW }))).toBe(true)
    expect(isOnboardingComplete(state({ skipped_at: NOW }))).toBe(true)
  })

  it('reports the last step as full progress', () => {
    expect(onboardingStepIndex('profile')).toBe(0)
    expect(onboardingProgress('profile')).toBeCloseTo(1 / ONBOARDING_STEPS.length)
    expect(onboardingProgress('finish')).toBe(1)
  })
})

describe('advancePatch', () => {
  it('moves to the next step and records the one just filled', () => {
    const patch = advancePatch(state({ step: 'profile' }), NOW)
    expect(patch.step).toBe('projects')
    expect(patch.completed_steps).toEqual(['profile'])
  })

  it('does not record the same step twice', () => {
    const patch = advancePatch(state({ step: 'profile', completed_steps: ['profile'] }), NOW)
    expect(patch.completed_steps).toEqual(['profile'])
  })

  it('keeps an existing start time rather than restamping it', () => {
    expect(advancePatch(state({ started_at: EARLIER }), NOW).started_at).toBe(EARLIER)
    expect(advancePatch(state({ started_at: null }), NOW).started_at).toBe(NOW)
  })

  it('completes the flow only when advancing off the last step', () => {
    expect(advancePatch(state({ step: 'goals' }), NOW).completed_at).toBeUndefined()
    expect(advancePatch(state({ step: 'finish' }), NOW).completed_at).toBe(NOW)
  })

  /* The regression guard. A patch that carried `answers` would deep-merge
     this render's stale copy over ids a step wrote moments earlier. */
  it('carries no key beyond step, completed_steps and started_at', () => {
    const patch = advancePatch(state({ step: 'projects' }), NOW)
    expect(Object.keys(patch).sort()).toEqual(['completed_steps', 'started_at', 'step'])
    expect(patch).not.toHaveProperty('answers')
  })
})

describe('skipStepPatch', () => {
  it('moves on without claiming the step was filled', () => {
    const patch = skipStepPatch(state({ step: 'projects' }), NOW)
    expect(patch.step).toBe('clients')
    expect(patch).not.toHaveProperty('completed_steps')
  })

  it('leaves by skipped_at at the end, never completed_at', () => {
    const patch = skipStepPatch(state({ step: 'finish' }), NOW)
    expect(patch.skipped_at).toBe(NOW)
    expect(patch).not.toHaveProperty('completed_at')
  })

  it('carries no key beyond step and started_at mid-flow', () => {
    const patch = skipStepPatch(state({ step: 'clients', started_at: EARLIER }), NOW)
    expect(Object.keys(patch).sort()).toEqual(['started_at', 'step'])
  })
})

describe('moving around', () => {
  it('steps back, and stops at the first step', () => {
    expect(backPatch(state({ step: 'clients' })).step).toBe('projects')
    expect(backPatch(state({ step: 'profile' })).step).toBe('profile')
  })

  it('does not run off the end going forward', () => {
    expect(advancePatch(state({ step: 'finish' }), NOW).step).toBe('finish')
  })

  it('refuses an unknown jump instead of resetting the flow', () => {
    expect(goToPatch('goals')).toEqual({ step: 'goals' })
    expect(goToPatch('daily_questions')).toBeNull()
    expect(goToPatch('')).toBeNull()
  })
})

describe('markStartedPatch', () => {
  /* Returning null means the caller writes nothing. When this wrote
     unconditionally — and spread the whole state to do it — it reverted
     the welcome_seen flag set moments before, which is why starting
     onboarding took two taps. */
  it('is a no-op once the flow has already started', () => {
    expect(markStartedPatch(state({ started_at: EARLIER }), NOW)).toBeNull()
  })

  it('stamps only started_at on a fresh flow', () => {
    expect(markStartedPatch(state({ started_at: null }), NOW)).toEqual({ started_at: NOW })
  })
})

describe('setAnswersPatch', () => {
  it('merges over what that step already held', () => {
    const base = state()
    base.answers.projects = { created_ids: ['p1'], project_id: 'p1', work_mode: null }
    const patch = setAnswersPatch(base, 'projects', { work_mode: 'solo' })
    expect(patch.answers?.projects).toEqual({
      created_ids: ['p1'],
      project_id: 'p1',
      work_mode: 'solo',
    })
  })

  it('names only the step being written', () => {
    const patch = setAnswersPatch(state(), 'clients', { created_ids: ['c1'] })
    expect(Object.keys(patch)).toEqual(['answers'])
    expect(Object.keys(patch.answers!)).toEqual(['clients'])
  })
})

describe('leaving the flow', () => {
  it('stamps exactly one timestamp and nothing else', () => {
    expect(skipAllPatch(NOW)).toEqual({ skipped_at: NOW })
    expect(completePatch(NOW)).toEqual({ completed_at: NOW })
    expect(seeWelcomePatch()).toEqual({ welcome_seen: true })
  })
})

describe('a whole run through the flow', () => {
  /* Walking every step the way the UI does, applying each patch the way
     the apps do (a shallow merge over the current state), and checking we
     arrive released rather than stuck. */
  it('ends completed, having recorded every step', () => {
    let current = state()
    for (let i = 0; i < ONBOARDING_STEPS.length; i += 1) {
      current = { ...current, ...advancePatch(current, NOW) } as OnboardingState
    }
    expect(current.completed_at).toBe(NOW)
    expect(isOnboardingComplete(current)).toBe(true)
    expect(current.completed_steps).toEqual([...ONBOARDING_STEPS])
  })

  it('leaves no step from which the user cannot get out', () => {
    for (const step of ONBOARDING_STEPS) {
      const from = state({ step })
      const skipped = { ...from, ...skipStepPatch(from, NOW) } as OnboardingState
      const advanced = { ...from, ...advancePatch(from, NOW) } as OnboardingState
      const moved = skipped.step !== step || isOnboardingComplete(skipped)
      expect(moved || isOnboardingComplete(advanced)).toBe(true)
    }
  })
})
