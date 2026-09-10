import { View, Text, useWindowDimensions } from 'react-native'
import Svg, { Path, Rect, Line, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg'
import { colors } from '../../theme/theme'
import { themed, useThemeMode } from '../../theme/themed'

/* ════════════════════════════════════════════════════════════════
   Hand-rolled SVG charts for the console — mirrors web's AdminCharts
   (no chart library there either) and the app's own FinanceChart.
   ════════════════════════════════════════════════════════════════
   Web measures its container with a ResizeObserver so the coordinate
   space maps 1:1 to pixels. Here the width is known ahead of time —
   the screen is one column at a fixed inset — so it comes from the
   window instead, and the chart re-renders on rotation for free.

   Colours are read at RENDER, never captured: a chart built inside a
   memo and cached would keep the palette it was drawn under. See
   AGENTS.md, "Colours: read them, never keep them".
   ════════════════════════════════════════════════════════════════ */

const H = 168
const PAD_L = 30      // gutter for the y-axis value labels
const PAD_R = 10
const PAD_TOP = 12
const PAD_BOT = 24
const SCREEN_INSET = 40 + 24   // screen padding + card padding

function useChartWidth() {
  const { width } = useWindowDimensions()
  return Math.max(220, Math.round(width - SCREEN_INSET))
}

/* Up to three y ticks (0 … max) so the magnitude is readable. */
function yTicks(max) {
  if (max <= 1) return [0, Math.max(1, max)]
  return [...new Set([0, Math.round(max / 2), max])]
}

/* Sparse, evenly-spaced x labels. Four rather than web's six — a phone
   is a third the width and six collide into a smear. */
function pickLabels(n, max = 4) {
  if (n <= max) return [...Array(n).keys()]
  const step = (n - 1) / (max - 1)
  return [...Array(max).keys()].map((i) => Math.round(i * step))
}

/* Bar chart — data: [{ count, ... }]. Used for weekly signups. */
export function BarChart({ data, formatX = (d) => d.label }) {
  const W = useChartWidth()
  useThemeMode() // repaint on a palette switch; the colours below are read live
  if (!data?.length) return <View style={{ height: H }} />

  const max = Math.max(1, ...data.map((d) => d.count))
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_TOP - PAD_BOT
  const slot = innerW / data.length
  const bw = Math.max(2, Math.min(26, slot * 0.62))
  const yOf = (v) => PAD_TOP + (1 - v / max) * innerH
  const labelIdx = new Set(pickLabels(data.length))

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {yTicks(max).map((v) => (
        <Line key={`y${v}`} x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke={colors.divider} strokeWidth={1} />
      ))}
      {yTicks(max).map((v) => (
        <SvgText key={`t${v}`} x={PAD_L - 5} y={yOf(v) + 3.5} textAnchor="end" fontSize={9} fill={colors.textFaint}>{String(v)}</SvgText>
      ))}
      {data.map((d, i) => {
        const x = PAD_L + i * slot + (slot - bw) / 2
        const y = yOf(d.count)
        return (
          <Rect key={i} x={x} y={y} width={bw} height={Math.max(0, PAD_TOP + innerH - y)} rx={3} fill={colors.brand} opacity={0.85} />
        )
      })}
      {data.map((d, i) => (labelIdx.has(i) ? (
        <SvgText key={`x${i}`} x={PAD_L + i * slot + slot / 2} y={H - 7} textAnchor="middle" fontSize={9} fill={colors.textFaint}>
          {formatX(d)}
        </SvgText>
      ) : null))}
    </Svg>
  )
}

/* Line + soft area — data: [{ count, ... }]. `alt` paints the sage variant. */
export function LineChart({ data, alt = false, formatX = (d) => d.label, gradId = 'admArea' }) {
  const W = useChartWidth()
  useThemeMode()
  if (!data?.length) return <View style={{ height: H }} />

  const tint = alt ? colors.positive : colors.brand
  const max = Math.max(1, ...data.map((d) => d.count))
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_TOP - PAD_BOT
  const stepX = innerW / Math.max(1, data.length - 1)
  /* One bucket (the "today" window) has no line to draw — centre the
     point instead of pinning it to the left edge. */
  const single = data.length === 1
  const xOf = (i) => (single ? PAD_L + innerW / 2 : PAD_L + i * stepX)
  const yOf = (v) => PAD_TOP + (1 - v / max) * innerH

  let path = ''
  data.forEach((d, i) => { path += (i === 0 ? 'M' : ' L') + xOf(i).toFixed(1) + ',' + yOf(d.count).toFixed(1) })
  const baseY = PAD_TOP + innerH
  const area = path ? `${path} L${xOf(data.length - 1).toFixed(1)},${baseY.toFixed(1)} L${xOf(0).toFixed(1)},${baseY.toFixed(1)} Z` : ''
  const labelIdx = new Set(pickLabels(data.length))

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={tint} stopOpacity={0.26} />
          <Stop offset="100%" stopColor={tint} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {yTicks(max).map((v) => (
        <Line key={`y${v}`} x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke={colors.divider} strokeWidth={1} />
      ))}
      {yTicks(max).map((v) => (
        <SvgText key={`t${v}`} x={PAD_L - 5} y={yOf(v) + 3.5} textAnchor="end" fontSize={9} fill={colors.textFaint}>{String(v)}</SvgText>
      ))}
      {area ? <Path d={area} fill={`url(#${gradId})`} /> : null}
      {path ? <Path d={path} stroke={tint} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {single ? <Circle cx={xOf(0)} cy={yOf(data[0].count)} r={4} fill={tint} /> : null}
      {data.map((d, i) => (labelIdx.has(i) ? (
        <SvgText key={`x${i}`} x={xOf(i)} y={H - 7} textAnchor="middle" fontSize={9} fill={colors.textFaint}>
          {formatX(d)}
        </SvgText>
      ) : null))}
    </Svg>
  )
}

/* Horizontal funnel — data: [{ label, count }], each bar relative to the
   largest. Plain views rather than SVG: the labels are real text that has
   to wrap and mirror under RTL, which SvgText will not do. */
export function FunnelBars({ data }) {
  useThemeMode()
  if (!data?.length) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <View style={styles.funnel}>
      {data.map((d, i) => (
        <View key={i} style={styles.funnelRow}>
          <Text style={styles.funnelLabel} numberOfLines={2}>{d.label}</Text>
          <View style={styles.funnelTrack}>
            <View style={[styles.funnelFill, { width: `${(d.count / max) * 100}%` }]} />
          </View>
          <Text style={styles.funnelCount}>{d.count}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = themed((c, t) => ({
  funnel: { gap: 10 },
  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funnelLabel: { ...t.micro, color: c.textSub, width: 92 },
  funnelTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: c.fill, overflow: 'hidden' },
  funnelFill: { height: 8, borderRadius: 999, backgroundColor: c.brand },
  funnelCount: { ...t.micro, color: c.text, minWidth: 26, textAlign: 'right', fontWeight: '600' },
}))
