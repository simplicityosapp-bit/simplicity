import { useCallback, useMemo } from 'react'
import {
  ONBOARDING_STEPS,
  defaultOnboarding,
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
} from '@simplicity/core'
import { useUserPreferences } from './useUserPreferences'

/* ════════════════════════════════════════════════════════════════
   useOnboarding — React binding for the shared wizard state machine.
   ════════════════════════════════════════════════════════════════
   The rules themselves live in @simplicity/core/domain/onboarding, so
   apps/mobile drives the same flow over the same preferences blob rather
   than growing a second copy that drifts. This file is only the React
   part: read prefs, hand the current state to a transition, persist the
   patch it returns.

   Source of truth: prefs.onboarding (JSONB sub-blob). We expose:
     - state:    the full onboarding sub-object
     - step:     current step key
     - stepIndex / total / progress (0..1)
     - isComplete: completed_at is set (or skipped_at)
     - advance(): mark current step completed + move forward. At the last
       step it completes the whole flow.
     - skipStep(): move forward without marking current step completed
       (tree will not grow for this step).
     - skipAll(): bail out of onboarding entirely; flips skipped_at +
       releases the guard.
     - back(): move to previous step.
     - goTo(stepKey): jump to a specific step.
     - setAnswers(key, patch): merge into answers[key].
     - seeWelcome(): acknowledge the pre-flow gate.
     - complete(): finish and release the guard.

   Every transition returns ONLY the keys it changes, and update() deep-
   merges that over the LATEST prefs. Never spread `...state` into a
   patch here: `state` is this render's snapshot, and a step that ran
   setAnswers(created_ids) immediately before advance() has already
   written fresh ids that a stale snapshot would clobber back to [] —
   re-orphaning the rows and duplicating them on Back then Next. The core
   module documents that bug and the two others this shape prevents.

   A transition that returns null (markStarted on an already-started flow,
   goTo with an unknown key) is a no-op rather than a write.
   ════════════════════════════════════════════════════════════════ */

export function useOnboarding() {
  const { prefs, update, loading } = useUserPreferences()
  const state = prefs?.onboarding || defaultOnboarding()
  const step = state.step
  const completedSteps = useMemo(() => state.completed_steps || [], [state.completed_steps])

  const patch = useCallback(
    (next) => (next ? update({ onboarding: next }) : Promise.resolve()),
    [update],
  )

  const setAnswers = useCallback(
    (key, answersPatch) => patch(setAnswersPatch(state, key, answersPatch)),
    [patch, state],
  )

  const markStarted = useCallback(() => patch(markStartedPatch(state)), [patch, state])
  const advance = useCallback(() => patch(advancePatch(state)), [patch, state])
  const skipStep = useCallback(() => patch(skipStepPatch(state)), [patch, state])
  const back = useCallback(() => patch(backPatch(state)), [patch, state])
  const goTo = useCallback((key) => patch(goToPatch(key)), [patch])
  const skipAll = useCallback(() => patch(skipAllPatch()), [patch])
  const complete = useCallback(() => patch(completePatch()), [patch])
  const seeWelcome = useCallback(() => patch(seeWelcomePatch()), [patch])

  return useMemo(() => ({
    loading,
    state,
    step,
    stepIndex: onboardingStepIndex(step),
    total: ONBOARDING_STEPS.length,
    progress: onboardingProgress(step),
    isComplete: isOnboardingComplete(state),
    completedSteps,
    markStarted,
    setAnswers,
    advance,
    skipStep,
    back,
    goTo,
    skipAll,
    complete,
    seeWelcome,
  }), [loading, state, step, completedSteps, markStarted, setAnswers, advance, skipStep, back, goTo, skipAll, complete, seeWelcome])
}
