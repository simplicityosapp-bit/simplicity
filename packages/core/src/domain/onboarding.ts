/* ════════════════════════════════════════════════════════════════
   ONBOARDING — the wizard state machine, as pure transitions.
   ════════════════════════════════════════════════════════════════
   Shared by apps/web and apps/mobile. Both store the flow in the same
   place — user_preferences.preferences.onboarding — and both release the
   same guard, so the rules for moving through it belong here rather than
   once per platform. (The DB agrees: onboarding_completed() reads this
   blob, and a free-tier RLS policy is written in terms of it.)

   EVERY TRANSITION RETURNS A PATCH, NEVER A WHOLE STATE. That is the
   point of this module, not a stylistic choice. Persistence on both
   platforms is a deep-merge over the LATEST preferences, so returning
   `{ ...state, step: next }` would re-inject the caller's render-time
   snapshot over newer values and silently revert them. Three shipped
   bugs came from exactly that:

     · a step wrote created_ids and immediately advanced; the advance
       carried a stale `answers` and clobbered the ids back to []. The
       rows were orphaned, so Back then Next created a SECOND project,
       client and goal.
     · the welcome gate set welcome_seen, then markStarted spread a
       snapshot where it was still false and reverted it — the "you have
       to press start twice" bug.
     · a user parked on a step that was later retired had indexOf return
       -1 and was dropped back on step one to redo finished work.

   Returning only changed keys makes the first two unrepresentable, and
   RETIRED_STEPS below handles the third.

   `now` is injectable on the transitions that stamp a time, so tests can
   assert exact values instead of matching a shape.
   ════════════════════════════════════════════════════════════════ */

export const ONBOARDING_STEPS = ['profile', 'projects', 'clients', 'goals', 'finish'] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/* Where a user parked on a retired step resumes: the surviving step that
   comes after the work the retired one did. The flow was nine steps and
   configured projects, groups, daily questions and recurring expenses
   before the user had seen a screen; import, questions and recurring now
   live behind the home setup card. */
const RETIRED_STEPS: Readonly<Record<string, OnboardingStep>> = {
  data_import: 'projects',
  daily_questions: 'goals',
  recurring: 'goals',
  preview: 'goals',
}

export interface OnboardingAnswers {
  profile: { name: string; role: string | null }
  projects: { created_ids: string[]; project_id: string | null; work_mode: string | null }
  clients: { created_ids: string[] }
  goals: { created_ids: string[]; goal_id: string | null; income_goal_amount: number | null }
}

export interface OnboardingState {
  version: number
  step: OnboardingStep
  /* pre-flow gate: the logo + chooser shows until acknowledged */
  welcome_seen: boolean
  completed_at: string | null
  /* user bailed out of the flow — still released to home */
  skipped_at: string | null
  started_at: string | null
  answers: OnboardingAnswers
  /* steps the user actually filled, not skipped — drives the tree growth */
  completed_steps: OnboardingStep[]
}

/* What a transition hands back: only the keys it changes. `answers` is
   itself partial, since a step patches one step's answers at a time. */
export type OnboardingPatch = Partial<Omit<OnboardingState, 'answers'>> & {
  answers?: Partial<Record<OnboardingStep, Record<string, unknown>>>
}

export function defaultOnboarding(): OnboardingState {
  return {
    version: 2,
    step: 'profile',
    welcome_seen: false,
    completed_at: null,
    skipped_at: null,
    started_at: null,
    answers: {
      profile: { name: '', role: null },
      projects: { created_ids: [], project_id: null, work_mode: null },
      clients: { created_ids: [] },
      goals: { created_ids: [], goal_id: null, income_goal_amount: null },
    },
    completed_steps: [],
  }
}

const isStep = (s: unknown): s is OnboardingStep =>
  typeof s === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(s)

/* Read a stored blob into a state that is safe to drive the flow with.
   Anything unrecognised (a hand-edited blob) restarts rather than
   dead-ends. */
export function migrateOnboarding(input: unknown): OnboardingState {
  const base = defaultOnboarding()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<OnboardingState>

  const out: OnboardingState = {
    ...base,
    ...raw,
    answers: { ...base.answers, ...(raw.answers || {}) },
    completed_steps: Array.isArray(raw.completed_steps) ? raw.completed_steps : [],
  }

  if (!isStep(out.step)) out.step = RETIRED_STEPS[out.step as string] || ONBOARDING_STEPS[0]
  out.completed_steps = out.completed_steps.filter(isStep)

  /* Answers are keyed by step, and a deep-merging update() never removes a
     key — so the retired steps would keep theirs in the blob forever, read
     by nothing. Keep only steps that still have somewhere to put them. */
  const live = Object.keys(base.answers)
  out.answers = Object.fromEntries(
    Object.entries(out.answers).filter(([step]) => live.includes(step)),
  ) as OnboardingAnswers

  /* The file import moved to Settings, so the raw parse of the user's
     spreadsheet — real client data held only to render a review — is no
     longer kept in preferences. Dropped on read for anyone who still has
     one from the old flow. */
  delete (out as { parsed_data?: unknown }).parsed_data
  return out
}

export function isOnboardingComplete(
  state: Pick<OnboardingState, 'completed_at' | 'skipped_at'>,
): boolean {
  return !!(state.completed_at || state.skipped_at)
}

export function onboardingStepIndex(step: OnboardingStep): number {
  return Math.max(0, ONBOARDING_STEPS.indexOf(step))
}

/* 0..1, where the last step reads as 1. */
export function onboardingProgress(step: OnboardingStep): number {
  return (onboardingStepIndex(step) + 1) / ONBOARDING_STEPS.length
}

const isLast = (step: OnboardingStep): boolean =>
  step === ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]

const nextStep = (step: OnboardingStep): OnboardingStep =>
  ONBOARDING_STEPS[Math.min(onboardingStepIndex(step) + 1, ONBOARDING_STEPS.length - 1)]!

const prevStep = (step: OnboardingStep): OnboardingStep =>
  ONBOARDING_STEPS[Math.max(onboardingStepIndex(step) - 1, 0)]!

/* Null when the flow already carries a start time — the caller skips the
   write rather than restamping it. */
export function markStartedPatch(
  state: Pick<OnboardingState, 'started_at'>,
  now: string = new Date().toISOString(),
): OnboardingPatch | null {
  return state.started_at ? null : { started_at: now }
}

/* One step's answers, merged over what that step already held. Only the
   named step appears in the patch. */
export function setAnswersPatch(
  state: Pick<OnboardingState, 'answers'>,
  step: OnboardingStep,
  patch: Record<string, unknown>,
): OnboardingPatch {
  const current = (state.answers as unknown as Record<string, Record<string, unknown>>)[step] || {}
  return { answers: { [step]: { ...current, ...patch } } }
}

/* Mark the current step filled and move on. Advancing off the last step
   completes the flow. */
export function advancePatch(
  state: Pick<OnboardingState, 'step' | 'completed_steps' | 'started_at'>,
  now: string = new Date().toISOString(),
): OnboardingPatch {
  const current = state.step
  const completed = state.completed_steps.includes(current)
    ? state.completed_steps
    : [...state.completed_steps, current]

  const patch: OnboardingPatch = {
    step: nextStep(current),
    completed_steps: completed,
    started_at: state.started_at || now,
  }
  if (isLast(current)) patch.completed_at = now
  return patch
}

/* Move on WITHOUT marking the step filled, so the tree does not grow for
   it. Skipping off the last step leaves via skipped_at, not completed_at:
   both release the guard, and only one claims the user did the work. */
export function skipStepPatch(
  state: Pick<OnboardingState, 'step' | 'started_at'>,
  now: string = new Date().toISOString(),
): OnboardingPatch {
  const patch: OnboardingPatch = {
    step: nextStep(state.step),
    started_at: state.started_at || now,
  }
  if (isLast(state.step)) patch.skipped_at = now
  return patch
}

export function backPatch(state: Pick<OnboardingState, 'step'>): OnboardingPatch {
  return { step: prevStep(state.step) }
}

/* Null for an unknown key, so a bad jump is a no-op rather than a reset. */
export function goToPatch(step: string): OnboardingPatch | null {
  return isStep(step) ? { step } : null
}

export function skipAllPatch(now: string = new Date().toISOString()): OnboardingPatch {
  return { skipped_at: now }
}

export function completePatch(now: string = new Date().toISOString()): OnboardingPatch {
  return { completed_at: now }
}

export function seeWelcomePatch(): OnboardingPatch {
  return { welcome_seen: true }
}

/* ────────────────────────────────────────────────────────────────
   The growing tree — which of the ten artwork stages a step shows.
   ────────────────────────────────────────────────────────────────
   Lives here because it is a function of the step COUNT, which lives
   here. It was `stepIndex + 2`, which landed on the full canopy only
   because the flow happened to have nine steps; cutting it to five would
   have quietly stopped the tree at stage 6 — the payoff of the whole
   metaphor never shown, and nothing anywhere failing.

   Two promises, whatever the step count becomes:
     · the LAST step is always stage 10, the full canopy;
     · the stages only ever grow, in even strides. With fewer steps than
       stages the middle ones are skipped rather than repeated, so the
       tree visibly changes at every step instead of stalling.

   WHY IT STARTS AT 4. Measured over the artwork's alpha channel, stages
   1–4 are near-identical: ~6% ink filling ~22% of the 256px frame, i.e.
   a sprout adrift in mostly-empty canvas. Stages 5–10 fill ~45%.
   Rendered into one fixed box the early frames come out at roughly half
   the visual size with a third of the ink — a speck against a bright
   sky, which is exactly what "the tree images are missing" meant.
   Starting at 4 keeps a sprout for the opening and makes every step a
   visibly different tree: 4 · 6 · 7 · 9 · 10. */
const FIRST_STAGE = 4
const LAST_STAGE = 10

export function treeStage(
  stepIndex: number,
  totalSteps: number = ONBOARDING_STEPS.length,
): number {
  const lastIndex = Math.max(1, totalSteps - 1)
  const clamped = Math.min(Math.max(stepIndex, 0), lastIndex)
  return FIRST_STAGE + Math.round((clamped / lastIndex) * (LAST_STAGE - FIRST_STAGE))
}
