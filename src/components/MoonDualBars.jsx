import { useT } from '../i18n/useT'
import './MoonDualBars.css'
import { Box, Txt } from './ui'

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
    <Box className="moon-dual">
      {COLS.map((c) => {
        const v = c.key === 'pace' ? pace : goal
        return (
          <Box key={c.key} className="moon-dual-col">
            <Box className="moon-dual-head">
              <Txt className="moon-dual-lbl">{t(c.labelKey)}</Txt>
              <Txt className="moon-dual-val mono">{v != null ? `${v}%` : '—'}</Txt>
            </Box>
            <Box className="moon-dual-bar">
              <Box className="moon-dual-fill" style={{ width: `${Math.min(100, Math.max(0, v || 0))}%`, background: c.color }} />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
