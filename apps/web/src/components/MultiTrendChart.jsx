import i18n from '@simplicity/core/i18n'
import { useT } from '../i18n/useT'
import './MultiTrendChart.css'
import { Box, Txt } from './ui'

/* Overlaid, self-normalized (0–100) line chart for the מבט-על trends.
   Each series is drawn relative to its own min/max (see overview.js §8.1);
   missing days are bridged into a continuous line with a dot on each real
   measurement. Stroke colors are concrete hex set inline — NOT var() — to
   dodge the dark-mode SVG-stroke var() bug. */

const W = 300
const H = 110
const PAD = 6

/* Build an SVG path from normalized points. Missing days (null) are BRIDGED —
   the pen stays down across a gap so the line stays continuous instead of
   shattering into disjoint segments (a self-reported question answered on only
   some days used to draw as a scatter of broken strokes). Each REAL measurement
   also gets a dot (dotsFor) so sparse data still reads honestly — you can see
   exactly which days have data rather than mistaking a bridge for dense input. */
function pathFor(norm) {
  const n = norm.length
  if (n < 2) return ''
  let d = ''
  let pen = false
  norm.forEach((v, i) => {
    if (v == null) return // skip the missing day but keep the pen down → bridge it
    const x = PAD + (i / (n - 1)) * (W - 2 * PAD)
    const y = H - PAD - (v / 100) * (H - 2 * PAD)
    d += `${pen ? 'L' : 'M'}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10} `
    pen = true
  })
  return d.trim()
}

/* Screen coords of every real (non-null) point — drawn as dots over the line so
   the actual measurements stay visible even where the line bridges a gap. */
function dotsFor(norm) {
  const n = norm.length
  if (n < 2) return []
  const out = []
  norm.forEach((v, i) => {
    if (v == null) return
    const x = PAD + (i / (n - 1)) * (W - 2 * PAD)
    const y = H - PAD - (v / 100) * (H - 2 * PAD)
    out.push({ i, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  })
  return out
}

function fmtRaw(v, unit) {
  if (v == null) return '—'
  const locale = i18n.language === 'he' ? 'he-IL' : (i18n.language || 'he-IL')
  const num = unit === '₪' ? Math.round(v).toLocaleString(locale) : Math.round(v * 10) / 10
  return unit ? `${num} ${unit}` : `${num}`
}

export default function MultiTrendChart({ days, series }) {
  const { t } = useT('reports')
  const drawable = (series || []).filter((s) => s.norm.some((v) => v != null))
  if (drawable.length === 0 || (days?.length || 0) < 2) {
    return <Txt as="p" className="mt-empty">{t('trend.empty')}</Txt>
  }
  return (
    <Box className="mt-wrap">
      <svg className="mt-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('trend.aria')}>
        {drawable.map((s) => (
          <g key={s.key}>
            <path className="mt-line" style={{ stroke: s.color }} d={pathFor(s.norm)} />
            {dotsFor(s.norm).map((p) => (
              <circle key={p.i} className="mt-dot" cx={p.x} cy={p.y} r="1.8" style={{ fill: s.color }} />
            ))}
          </g>
        ))}
      </svg>
      <Box className="mt-legend">
        {drawable.map((s) => (
          <Txt key={s.key} className="mt-legend-item">
            <Txt className="mt-legend-dot" style={{ background: s.color }} />
            <Txt className="mt-legend-label">{s.label}</Txt>
            <Txt className="mt-legend-val mono">{fmtRaw(s.summary, s.unit)}</Txt>
          </Txt>
        ))}
      </Box>
    </Box>
  )
}
