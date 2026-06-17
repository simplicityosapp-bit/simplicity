import { useT } from '../i18n/useT'
import './MoonDualBars.css'

/* Two compact bars for a SINGLE goal/category: pace ("מהקצב") and progress
   toward the goal ("מהיעד"), side by side with a tiny sub-label above each.
   Replaces the lone pace bar the moon-glance breakdown used to show per item.
   Values can exceed 100 (shown as text); the bar width is capped at 100. */
const COLS = [
  { key: 'pace', labelKey: 'dualBars.pace', color: 'var(--sage)' },
  { key: 'goal', labelKey: 'dualBars.goal', color: 'var(--moon-deep)' },
]

export default function MoonDualBars({ pace = 0, goal = null }) {
  const { t } = useT('moon')
  return (
    <div className="moon-dual">
      {COLS.map((c) => {
        const v = c.key === 'pace' ? pace : goal
        return (
          <div key={c.key} className="moon-dual-col">
            <div className="moon-dual-head">
              <span className="moon-dual-lbl">{t(c.labelKey)}</span>
              <span className="moon-dual-val mono">{v != null ? `${v}%` : '—'}</span>
            </div>
            <div className="moon-dual-bar">
              <div className="moon-dual-fill" style={{ width: `${Math.min(100, Math.max(0, v || 0))}%`, background: c.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
