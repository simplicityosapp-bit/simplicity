import { treeStage } from './treeStage'

/* The growing tree in the header — one image per step, from the 10-stage
   asset set. Which stage a step gets is treeStage(); the two promises it
   keeps (ends on the canopy, only ever grows) are documented there. */
export default function OnboardingTree({ stepIndex = 0 }) {
  return (
    <img
      className="ob-tree"
      src={`/onboarding-tree/${treeStage(stepIndex)}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
