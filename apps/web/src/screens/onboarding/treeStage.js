import { ONBOARDING_STEPS } from '../../lib/preferences'

/* Which of the 10 tree images a step shows (public/onboarding-tree/1..10.png).

   Two promises, whatever the step count becomes:
     · the LAST step is always stage 10, the full canopy — the payoff the
       whole metaphor exists for;
     · the stages only ever grow, in even strides. With fewer steps than
       stages the middle ones are skipped rather than repeated, so the tree
       visibly changes at every step instead of stalling and then jumping.

   WHY IT STARTS AT 4. Measured over the artwork's alpha channel, stages
   1–4 are near-identical: ~6% ink filling ~22% of the 256px frame, i.e. a
   sprout adrift in mostly-empty canvas. Stages 5–10 fill ~45%. Rendered
   into one fixed box, the early frames therefore come out at roughly half
   the visual size with a third of the ink — a speck against a bright sky,
   which is exactly what "the tree images are missing" meant. Spanning from
   2 also spent two of five steps on frames nobody could tell apart.
   Starting at 4 keeps a sprout for the opening and makes every step a
   visibly different tree: 4 · 6 · 7 · 9 · 10.

   Its own module rather than a second export from OnboardingTree, which
   would cost that file its fast refresh. */

const FIRST_STAGE = 4
const LAST_STAGE = 10

export function treeStage(stepIndex, totalSteps = ONBOARDING_STEPS.length) {
  const lastIndex = Math.max(1, totalSteps - 1)
  const clamped = Math.min(Math.max(stepIndex, 0), lastIndex)
  return FIRST_STAGE + Math.round((clamped / lastIndex) * (LAST_STAGE - FIRST_STAGE))
}
