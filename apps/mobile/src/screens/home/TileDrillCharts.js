import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line, Rect, G } from 'react-native-svg'
import { colors } from '../../theme/theme'

// Mini-charts inside the tile drill modal (ports web modals/TileDrillCharts):
// a 30-day clients trend line + area, and 30-day income/expense paired bars.
const W = 300
const H = 70
const PAD_X = 6
const PAD_TOP = 6
const PAD_BOTTOM = 14

export function ClientsTrend({ values }) {
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
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="tdClientsArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={colors.positive} stopOpacity="0.22" />
          <Stop offset="100%" stopColor={colors.positive} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#tdClientsArea)" />
      <Path d={path} fill="none" stroke={colors.positive} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="3.6" fill={colors.positive} stroke={colors.card} strokeWidth="1.4" />
    </Svg>
  )
}

export function NetBars({ incomes, expenses }) {
  if (!incomes?.length) return null
  const n = incomes.length
  const mx = Math.max(...incomes, ...expenses, 1)
  const slot = (W - PAD_X * 2) / n
  const barW = Math.max(2, slot * 0.4)
  const yScale = (v) => PAD_TOP + (1 - v / (mx || 1)) * (H - PAD_TOP - PAD_BOTTOM)
  const baseY = H - PAD_BOTTOM
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <Line x1={PAD_X} y1={baseY} x2={W - PAD_X} y2={baseY} stroke={colors.divider} strokeWidth="0.5" />
      {incomes.map((v, i) => {
        const cx = PAD_X + i * slot + slot / 2
        const incY = yScale(v)
        const expY = yScale(expenses[i] || 0)
        return (
          <G key={i}>
            {v > 0 ? <Rect x={(cx - barW - 1).toFixed(1)} y={incY.toFixed(1)} width={barW.toFixed(1)} height={(baseY - incY).toFixed(1)} fill={colors.positive} opacity="0.85" rx="1" /> : null}
            {expenses[i] > 0 ? <Rect x={(cx + 1).toFixed(1)} y={expY.toFixed(1)} width={barW.toFixed(1)} height={(baseY - expY).toFixed(1)} fill={colors.danger} opacity="0.75" rx="1" /> : null}
          </G>
        )
      })}
    </Svg>
  )
}
