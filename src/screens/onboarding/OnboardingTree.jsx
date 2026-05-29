/* Image-based growing tree. Each of the 9 onboarding steps gets a
   slightly more mature tree from the 10-stage asset set (trees 2–10);
   tree 1 is the bare seedling and is reserved for a future
   pre-flow placement. The mapping (stepIndex + 2) keeps the final
   step (#9) on tree 10 — the fully-grown canopy — per the spec. */
export default function OnboardingTree({ stepIndex = 0 }) {
  const treeNum = Math.min(10, Math.max(2, stepIndex + 2))
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
