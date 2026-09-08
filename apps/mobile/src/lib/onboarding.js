import { useCallback, useMemo } from 'react'
import {
  ONBOARDING_STEPS,
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
} from '@simplicity/core'
import { usePreferences } from './preferences'

/* ════════════════════════════════════════════════════════════════
   useOnboarding — React Native binding for the shared state machine.
   ════════════════════════════════════════════════════════════════
   Deliberately the mirror of apps/web/src/hooks/useOnboarding.js: same
   surface, same rules, because the rules live once in
   @simplicity/core/domain/onboarding and both apps drive the SAME blob
   in user_preferences. A user can start the flow on the phone and finish
   it in a browser.

   Two differences from web, both forced by this app rather than chosen:

   · web reads prefs through migratePreferences, which normalises the
     onboarding sub-blob on the way in. Mobile reads the raw JSON from
     Supabase, so the normalising happens here instead — otherwise a blob
     written by an older flow (a retired step, answers for steps that no
     longer exist) would drive the wizard straight into the dead end
     RETIRED_STEPS exists to prevent.

   · `status` is surfaced so the gate can tell "still loading" from "never
     onboarded". Without it every cold start looks like a fresh user.

   Every transition returns only the keys it changes and update() deep-
   merges it over the latest prefs. Never spread the state into a patch;
   the core module documents the three bugs that shape prevents.
   ════════════════════════════════════════════════════════════════ */

export function useOnboarding() {
  const { prefs, update, status } = usePreferences()
  const state = useMemo(() => migrateOnboarding(prefs?.onboarding), [prefs?.onboarding])
  const step = state.step

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
    status,
    state,
    step,
    stepIndex: onboardingStepIndex(step),
    total: ONBOARDING_STEPS.length,
    progress: onboardingProgress(step),
    isComplete: isOnboardingComplete(state),
    completedSteps: state.completed_steps,
    markStarted,
    setAnswers,
    advance,
    skipStep,
    back,
    goTo,
    skipAll,
    complete,
    seeWelcome,
  }), [status, state, step, markStarted, setAnswers, advance, skipStep, back, goTo, skipAll, complete, seeWelcome])
}

/* Whether the app should hold this user in the onboarding flow.

   'loading' holds nothing back yet — the caller shows its own spinner
   rather than guessing. 'error' lets the user straight through: when the
   preferences read failed we know nothing about them, and trapping
   someone who finished onboarding months ago behind it again is a far
   worse failure than the free-tier cap going unapplied for one session. */
export function shouldOnboard({ status, state }) {
  if (status !== 'ready') return false
  return !isOnboardingComplete(state)
}
