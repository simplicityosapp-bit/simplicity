/* Tiny animated tree that grows as the user completes steps.
   Each completed step adds one branch; the trunk thickens and the
   crown brightens. Uses SVG paths sized to 56×64 so it fits in the
   shell header without dominating it. Pure presentational — caller
   passes the count of completed (not skipped) steps. */
export default function OnboardingTree({ completedCount = 0, total = 9 }) {
  const ratio = total > 0 ? Math.min(1, completedCount / total) : 0
  /* The 9 leaves are mapped to step indices 1..9. We render leaves
     1..completedCount with full color; the rest as faint outlines. */
  const leaves = [
    { cx: 14, cy: 22 },
    { cx: 22, cy: 14 },
    { cx: 30, cy: 18 },
    { cx: 38, cy: 12 },
    { cx: 44, cy: 22 },
    { cx: 18, cy: 32 },
    { cx: 28, cy: 28 },
    { cx: 36, cy: 30 },
    { cx: 30, cy: 38 },
  ]

  return (
    <svg
      className="ob-tree"
      viewBox="0 0 56 64"
      width="56"
      height="64"
      aria-label={`עץ ההתקדמות: ${completedCount} מתוך ${total} צעדים`}
      role="img"
    >
      {/* trunk */}
      <path
        d="M28 64 L28 38"
        stroke="var(--clay)"
        strokeWidth={2 + ratio * 1.4}
        strokeLinecap="round"
        opacity={0.6 + ratio * 0.4}
      />
      {/* roots hint */}
      <path d="M22 62 L28 58 L34 62" stroke="var(--clay)" strokeWidth="0.8" fill="none" opacity="0.4" />
      {/* leaves */}
      {leaves.map((l, i) => {
        const isOn = i < completedCount
        return (
          <circle
            key={i}
            cx={l.cx}
            cy={l.cy}
            r={isOn ? 4.2 : 3.4}
            fill={isOn ? 'var(--sage)' : 'none'}
            stroke="var(--sage)"
            strokeWidth="1.2"
            opacity={isOn ? 0.95 : 0.32}
            className={isOn ? 'ob-leaf on' : 'ob-leaf'}
          />
        )
      })}
    </svg>
  )
}
