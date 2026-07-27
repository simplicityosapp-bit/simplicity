import { ONBOARDING_STEPS } from '../../lib/preferences'

/* Image-based growing tree, from the 10-stage asset set. Tree 1 is the
   bare seedling, reserved for a future pre-flow placement, so the flow
   spans 2 → 10 and the last step always lands on the full canopy.

   The mapping used to be `stepIndex + 2`, which only reached 10 because
   the flow happened to have nine steps. At five it would have stopped at
   stage 6 and the canopy — the whole point of the metaphor — would never
   have been seen. Spreading across the range keeps that promise whatever
   the step count becomes. */
export default function OnboardingTree({ stepIndex = 0 }) {
  const last = Math.max(1, ONBOARDING_STEPS.length - 1)
  const treeNum = Math.min(10, Math.max(2, 2 + Math.round((stepIndex / last) * 8)))
  return (
    <img
      className="ob-tree"
      src={`/onboarding-tree/${treeNum}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
