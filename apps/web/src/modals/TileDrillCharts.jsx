/* Mini-charts used inside the tile drill modal — one for each tile.
   Compact SVGs sized for the modal frame, sharing the same visual
   language as the finance moonlight chart (cream stroke, accent dot,
   subtle area). Pure presentational; data shaping happens in the
   parent component so the charts can stay dumb. */

const W = 300
const H = 70
const PAD_X = 6
const PAD_TOP = 6
const PAD_BOTTOM = 14

/* 30-day line of cumulative new-clients-by-day. The dot marks today. */
export function ClientsTrend({ values, accent = 'var(--sage)' }) {
  if (!values?.length) return null
  const n = values.length
  const mx = Math.max(...values, 1)
  const stepX = (W - PAD_X * 2) / Math.max(1, n - 1)
  const yScale = (v) => PAD_TOP + (1 - v / (mx || 1)) * (H - PAD_TOP - PAD_BOTTOM)

  let path = ''
  values.forEach((v, i) => {
    const x = PAD_X + i * stepX
    const y = yScale(v)
    path += (path === '' ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1)
  })
  const lastX = PAD_X + (n - 1) * stepX
  const baseY = H - PAD_BOTTOM
  const area = path + ` L${lastX.toFixed(1)},${baseY.toFixed(1)} L${PAD_X.toFixed(1)},${baseY.toFixed(1)} Z`
  const lastY = yScale(values[n - 1])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="td-mini-chart" style={{ width: '100%', height: H }} aria-hidden="true">
      <defs>
        <linearGradient id="tdClientsArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#tdClientsArea)" />
      <path d={path} fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="3.6" fill={accent} stroke="var(--cream)" strokeWidth="1.4" />
    </svg>
  )
}

/* 30-day income vs expense paired bars. `incomes` and `expenses` are
   parallel arrays of length 30. */
export function NetBars({ incomes, expenses, incomeColor = 'var(--sage)', expenseColor = 'var(--clay)' }) {
  if (!incomes?.length) return null
  const n = incomes.length
  const mx = Math.max(...incomes, ...expenses, 1)
  const slot = (W - PAD_X * 2) / n
  const barW = Math.max(2, slot * 0.4)
  const yScale = (v) => PAD_TOP + (1 - v / (mx || 1)) * (H - PAD_TOP - PAD_BOTTOM)
  const baseY = H - PAD_BOTTOM

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="td-mini-chart" style={{ width: '100%', height: H }} aria-hidden="true">
      <line x1={PAD_X} y1={baseY} x2={W - PAD_X} y2={baseY} stroke="var(--divider)" strokeWidth="0.5" />
      {incomes.map((v, i) => {
        const cx = PAD_X + i * slot + slot / 2
        const incY = yScale(v)
        const expY = yScale(expenses[i] || 0)
        return (
          <g key={i}>
            {v > 0 && (
              <rect
                x={(cx - barW - 1).toFixed(1)}
                y={incY.toFixed(1)}
                width={barW.toFixed(1)}
                height={(baseY - incY).toFixed(1)}
                fill={incomeColor}
                opacity="0.85"
                rx="1"
              />
            )}
            {expenses[i] > 0 && (
              <rect
                x={(cx + 1).toFixed(1)}
                y={expY.toFixed(1)}
                width={barW.toFixed(1)}
                height={(baseY - expY).toFixed(1)}
                fill={expenseColor}
                opacity="0.75"
                rx="1"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
