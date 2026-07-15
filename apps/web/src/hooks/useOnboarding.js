import { useCallback, useMemo } from 'react'
import { useUserPreferences } from './useUserPreferences'
import { ONBOARDING_STEPS, defaultOnboarding } from '../lib/preferences'

/* ════════════════════════════════════════════════════════════════
   useOnboarding — wizard state machine over user_preferences.
   ════════════════════════════════════════════════════════════════
   Source of truth: prefs.onboarding (JSONB sub-blob). We expose:
     - state:    the full onboarding sub-object
     - step:     current step key
     - stepIndex / total / progress (0..1)
     - isComplete: completed_at is set (or skipped_at)
     - advance(answers?): mark current step completed + move forward.
       If at last step → complete the whole flow.
     - skipStep(): move forward without marking current step completed
       (tree won't grow for this step).
     - skipAll(): bail out of onboarding entirely; flips skipped_at +
       releases the guard.
     - back(): move to previous step.
     - goTo(stepKey): jump to a specific step.
     - setAnswers(key, patch): merge into answers[key].
     - setParsedData(data): used by step 2 to share CSV parse result
       with downstream steps.
     - complete(): finish and release the guard.
   All persistence is a deep-merge into user_preferences.onboarding.
   ════════════════════════════════════════════════════════════════ */

export function useOnboarding() {
  const { prefs, update, loading } = useUserPreferences()
  const state = prefs?.onboarding || defaultOnboarding()
  const step = state.step
  const stepIndex = Math.max(0, ONBOARDING_STEPS.indexOf(step))
  const total = ONBOARDING_STEPS.length
  const progress = total > 0 ? (stepIndex + 1) / total : 0
  const isComplete = !!(state.completed_at || state.skipped_at)
  const completedSteps = useMemo(() => state.completed_steps || [], [state.completed_steps])

  /* Patch a few onboarding keys. We deliberately DON'T spread `...state`
     here: `update` already deep-merges the patch over the LATEST prefs
     (prefsRef), so re-injecting this render's snapshot only risks
     clobbering a value written by an immediately-preceding update() in
     the same handler. That race was the "double-click to start" bug:
     WelcomeGate.onStart sets welcome_seen=true, then markStarted() ran
     patch({started_at}) which spread a stale state with welcome_seen=false
     and reverted it — bouncing the user straight back out of onboarding.
     (setAnswers already patches sub-keys without the spread — same idea.) */
  const patch = useCallback(
    (next) => update({ onboarding: next }),
    [update],
  )

  const setAnswers = useCallback(
    (key, answersPatch) => {
      const merged = { ...(state.answers?.[key] || {}), ...answersPatch }
      return update({ onboarding: { answers: { [key]: merged } } })
    },
    [update, state.answers],
  )

  const setParsedData = useCallback(
    (data) => update({ onboarding: { parsed_data: data } }),
    [update],
  )

  const markStarted = useCallback(() => {
    if (state.started_at) return
    return patch({ started_at: new Date().toISOString() })
  }, [state.started_at, patch])

  const advance = useCallback(
    async (extraAnswers) => {
      const cur = step
      const nextIdx = Math.min(ONBOARDING_STEPS.indexOf(cur) + 1, ONBOARDING_STEPS.length - 1)
      const nextStep = ONBOARDING_STEPS[nextIdx]
      const completed = completedSteps.includes(cur)
        ? completedSteps
        : [...completedSteps, cur]
      /* Patch ONLY the keys we change — do NOT spread `...state`. `state` is
         this render's snapshot; a step handler that ran setAnswers(...created_ids)
         immediately before advance() already wrote the fresh ids to prefsRef,
         and update() deep-merges over that latest prefs. Re-injecting the stale
         snapshot's `answers` here would clobber those ids back to [] (arrays are
         replaced wholesale), re-orphaning them → duplicate project/client/goal/
         question rows on Back→Next. Same rule the `patch` helper documents. */
      const nextState = {
        step: nextStep,
        completed_steps: completed,
        started_at: state.started_at || new Date().toISOString(),
      }
      if (extraAnswers) {
        /* deep-merges over the latest answers (never seen in practice — all
           callers advance() with no args — but kept correct just in case). */
        nextState.answers = extraAnswers
      }
      /* If we tried to advance past the last step, mark complete. */
      if (cur === ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]) {
        nextState.completed_at = new Date().toISOString()
      }
      return update({ onboarding: nextState })
    },
    [step, state, completedSteps, update],
  )

  const skipStep = useCallback(async () => {
    const cur = step
    const nextIdx = Math.min(ONBOARDING_STEPS.indexOf(cur) + 1, ONBOARDING_STEPS.length - 1)
    const nextStep = ONBOARDING_STEPS[nextIdx]
    /* Patch only what we change — never spread `...state` (stale snapshot); see
       advance() above for why. update() deep-merges over the latest prefs. */
    const nextState = {
      step: nextStep,
      started_at: state.started_at || new Date().toISOString(),
    }
    if (cur === ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]) {
      nextState.skipped_at = new Date().toISOString()
      nextState.parsed_data = null /* terminal — drop the raw CSV */
    }
    return update({ onboarding: nextState })
  }, [step, state, update])

  const back = useCallback(() => {
    const prevIdx = Math.max(0, ONBOARDING_STEPS.indexOf(step) - 1)
    return patch({ step: ONBOARDING_STEPS[prevIdx] })
  }, [step, patch])

  const goTo = useCallback((key) => {
    if (ONBOARDING_STEPS.includes(key)) return patch({ step: key })
    return Promise.resolve()
  }, [patch])

  const skipAll = useCallback(
    () => patch({ skipped_at: new Date().toISOString(), parsed_data: null }),
    [patch],
  )

  /* Completing is terminal — drop the raw CSV (personal client data we
     only kept for the review wizard) in the SAME write that sets
     completed_at, so a stale-state merge can't resurrect it. */
  const complete = useCallback(
    () => patch({ completed_at: new Date().toISOString(), parsed_data: null }),
    [patch],
  )

  return useMemo(() => ({
    loading,
    state,
    step,
    stepIndex,
    total,
    progress,
    isComplete,
    completedSteps,
    markStarted,
    setAnswers,
    setParsedData,
    advance,
    skipStep,
    back,
    goTo,
    skipAll,
    complete,
  }), [loading, state, step, stepIndex, total, progress, isComplete, completedSteps, markStarted, setAnswers, setParsedData, advance, skipStep, back, goTo, skipAll, complete])
}
