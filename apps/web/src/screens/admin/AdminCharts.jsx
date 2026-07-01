import { useLayoutEffect, useRef, useState } from 'react'
import { Box, Txt } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   Hand-rolled SVG charts for the admin console — no chart library,
   colours from tokens via CSS classes (admin.css). Each measures its
   container so the coordinate space maps 1:1 to pixels (no text smear
   from non-uniform scaling), mirroring screens/finance/FinanceChart.
   ════════════════════════════════════════════════════════════════ */

function useMeasuredWidth(fallback = 600) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => { const n = Math.round(el.clientWidth); if (n > 0) setW(n) }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const H = 180
const PAD_L = 34          // left gutter for the y-axis value labels
const PAD_R = 14
const PAD_TOP = 14
const PAD_BOT = 26

/* Up to three y-axis ticks (0 … max) so the magnitude is readable. */
function yTicks(max) {
  if (max <= 1) return [0, Math.max(1, max)]
  return [...new Set([0, Math.round(max / 2), max])]
}

/* Sparse, evenly-spaced x labels (first, ~middles, last) without overlap. */
function pickLabels(n, max = 6) {
  if (n <= max) return [...Array(n).keys()]
  const step = (n - 1) / (max - 1)
  return [...Array(max).keys()].map((i) => Math.round(i * step))
}

/* Bar chart — data: [{ label, count }]. `alt` paints the sage variant. */
export function BarChart({ data, alt = false, formatX = (d) => d.label }) {
  const [ref, W] = useMeasuredWidth()
  if (!data?.length) {
    return <Box ref={ref} className="admin-chart-svg" style={{ height: H }} />
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_TOP - PAD_BOT
  const slot = innerW / data.length
  const bw = Math.max(2, Math.min(34, slot * 0.62))
  const yOf = (v) => PAD_TOP + (1 - v / max) * innerH
  const labelIdx = new Set(pickLabels(data.length))

  return (
    <Box ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="admin-chart-svg" style={{ height: H }} role="img">
        {/* y-axis — gridlines + value labels (so the magnitude is readable) */}
        {yTicks(max).map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} className="admin-chart-grid" />
            <text x={PAD_L - 6} y={yOf(v) + 3.5} textAnchor="end" className="admin-chart-axis">{v}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD_L + i * slot + (slot - bw) / 2
          const y = yOf(d.count)
          const h = PAD_TOP + innerH - y
          return (
            <g key={i}>
              <rect x={x.toFixed(1)} y={y.toFixed(1)} width={bw.toFixed(1)} height={Math.max(0, h).toFixed(1)} rx="3"
                className={`admin-chart-bar${alt ? ' alt' : ''}`} />
              {labelIdx.has(i) && (
                <text x={(x + bw / 2).toFixed(1)} y={H - 8} textAnchor="middle" className="admin-chart-axis">
                  {formatX(d)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </Box>
  )
}

/* Line + area chart — data: [{ label, count }]. `alt` paints sage. */
export function LineChart({ data, alt = false, formatX = (d) => d.label, gradId = 'admChartArea' }) {
  const [ref, W] = useMeasuredWidth()
  if (!data?.length) {
    return <Box ref={ref} className="admin-chart-svg" style={{ height: H }} />
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_TOP - PAD_BOT
  const stepX = innerW / Math.max(1, data.length - 1)
  const xOf = (i) => PAD_L + i * stepX
  const yOf = (v) => PAD_TOP + (1 - v / max) * innerH

  let path = ''
  data.forEach((d, i) => {
    path += (i === 0 ? 'M' : ' L') + xOf(i).toFixed(1) + ',' + yOf(d.count).toFixed(1)
  })
  const baseY = PAD_TOP + innerH
  const area = path
    ? `${path} L${xOf(data.length - 1).toFixed(1)},${baseY.toFixed(1)} L${xOf(0).toFixed(1)},${baseY.toFixed(1)} Z`
    : ''
  const labelIdx = new Set(pickLabels(data.length))

  return (
    <Box ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="admin-chart-svg" style={{ height: H }} role="img">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className={`admin-chart-area-top${alt ? ' alt' : ''}`} />
            <stop offset="100%" className="admin-chart-area-bot" />
          </linearGradient>
        </defs>
        {/* y-axis — gridlines + value labels (so the magnitude is readable) */}
        {yTicks(max).map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} className="admin-chart-grid" />
            <text x={PAD_L - 6} y={yOf(v) + 3.5} textAnchor="end" className="admin-chart-axis">{v}</text>
          </g>
        ))}
        {area && <path d={area} fill={`url(#${gradId})`} />}
        {path && <path d={path} className={`admin-chart-line${alt ? ' alt' : ''}`} />}
        {data.map((d, i) => (
          labelIdx.has(i) ? (
            <text key={i} x={xOf(i).toFixed(1)} y={H - 8} textAnchor="middle" className="admin-chart-axis">
              {formatX(d)}
            </text>
          ) : null
        ))}
      </svg>
    </Box>
  )
}

/* Horizontal funnel — data: [{ label, count }], widths relative to the
   top (largest) value. Used for the onboarding funnel. */
export function FunnelBars({ data }) {
  if (!data?.length) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <Box className="admin-funnel">
      {data.map((d, i) => (
        <Box className="admin-funnel-row" key={i}>
          <Txt className="admin-funnel-label">{d.label}</Txt>
          <Box className="admin-funnel-track">
            <Txt className="admin-funnel-fill" style={{ width: `${(d.count / max) * 100}%` }} />
          </Box>
          <Txt className="admin-funnel-count">{d.count}</Txt>
        </Box>
      ))}
    </Box>
  )
}
