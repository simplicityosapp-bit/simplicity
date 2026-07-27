import { ONBOARDING_STEPS } from '../../lib/preferences'

/* Which of the 10 tree images a step shows (public/onboarding-tree/1..10.png).

   Stage 1 is the bare seedling, reserved for a future pre-flow placement,
   so the flow spans 2 → 10 and makes two promises whatever the step count
   becomes:
     · the LAST step is always stage 10, the full canopy — the payoff the
       whole metaphor exists for;
     · the stages only ever grow, in even strides. With fewer steps than
       stages the middle ones are skipped rather than repeated, so the tree
       visibly changes at every step instead of stalling and then jumping.

   At five steps that reads 2 · 4 · 6 · 8 · 10. The mapping used to be
   `stepIndex + 2`, which reached the canopy only because the flow happened
   to have nine steps; at five it stopped at stage 6 and the canopy was
   never seen at all.

   Its own module rather than a second export from OnboardingTree, which
   would cost that file its fast refresh. */

const FIRST_STAGE = 2
const LAST_STAGE = 10

export function treeStage(stepIndex, totalSteps = ONBOARDING_STEPS.length) {
  const lastIndex = Math.max(1, totalSteps - 1)
  const clamped = Math.min(Math.max(stepIndex, 0), lastIndex)
  return FIRST_STAGE + Math.round((clamped / lastIndex) * (LAST_STAGE - FIRST_STAGE))
}
