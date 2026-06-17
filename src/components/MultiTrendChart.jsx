import { useT } from '../i18n/useT'
import './MultiTrendChart.css'

/* Overlaid, self-normalized (0–100) line chart for the מבט-על trends.
   Each series is drawn relative to its own min/max (see overview.js §8.1);
   nulls break the line into gaps. Stroke colors are concrete hex set
   inline — NOT var() — to dodge the dark-mode SVG-stroke var() bug. */

const W = 300
const H = 110
const PAD = 6

/* Build an SVG path from normalized points, starting a fresh subpath
   after every gap (null) so missing days don't draw a false straight line. */
function pathFor(norm) {
  const n = norm.length
  if (n < 2) return ''
  let d = ''
  let pen = false
  norm.forEach((v, i) => {
    if (v == null) { pen = false; return }
    const x = PAD + (i / (n - 1)) * (W - 2 * PAD)
    const y = H - PAD - (v / 100) * (H - 2 * PAD)
    d += `${pen ? 'L' : 'M'}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10} `
    pen = true
  })
  return d.trim()
}

function fmtRaw(v, unit) {
  if (v == null) return '—'
  const num = unit === '₪' ? Math.round(v).toLocaleString('en-US') : Math.round(v * 10) / 10
  return unit ? `${num} ${unit}` : `${num}`
}

export default function MultiTrendChart({ days, series }) {
  const { t } = useT('reports')
  const drawable = (series || []).filter((s) => s.norm.some((v) => v != null))
  if (drawable.length === 0 || (days?.length || 0) < 2) {
    return <p className="mt-empty">{t('trend.empty')}</p>
  }
  return (
    <div className="mt-wrap">
      <svg className="mt-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('trend.aria')}>
        {drawable.map((s) => (
          <path key={s.key} className="mt-line" style={{ stroke: s.color }} d={pathFor(s.norm)} />
        ))}
      </svg>
      <div className="mt-legend">
        {drawable.map((s) => (
          <span key={s.key} className="mt-legend-item">
            <span className="mt-legend-dot" style={{ background: s.color }} />
            <span className="mt-legend-label">{s.label}</span>
            <span className="mt-legend-val mono">{fmtRaw(s.summary, s.unit)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
