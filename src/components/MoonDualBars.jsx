import './MoonDualBars.css'

/* Two compact stacked bars summarising the overall moon-glance score:
   pace ("מהקצב") and progress toward the goal ("מהיעד"). The big ring keeps
   showing pace as before — these add the goal-% view alongside it without
   taking the ring's place. Each value can exceed 100 (shown as text); the
   bar width is capped at 100. Sub-label sits above each thin bar so it stays
   compact (no extra vertical space beyond the two short rows). */
const ROWS = [
  { key: 'pace', label: 'מהקצב', color: 'var(--sage)' },
  { key: 'goal', label: 'מהיעד', color: 'var(--moon-deep)' },
]

export default function MoonDualBars({ pace = 0, goal = null }) {
  const valueOf = (key) => (key === 'pace' ? pace : goal)
  return (
    <div className="moon-dual">
      {ROWS.map((r) => {
        const v = valueOf(r.key)
        return (
          <div key={r.key} className="moon-dual-row">
            <div className="moon-dual-head">
              <span className="moon-dual-lbl">{r.label}</span>
              <span className="moon-dual-val mono">{v != null ? `${v}%` : '—'}</span>
            </div>
            <div className="moon-dual-bar">
              <div className="moon-dual-fill" style={{ width: `${Math.min(100, Math.max(0, v || 0))}%`, background: r.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
