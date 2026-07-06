import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg'
import { Sparkles } from 'lucide-react-native'
import { financeDailyBuckets, isr } from '@simplicity/core'
import Card from '../../components/Card'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'

// Cumulative-income line for the selected month (mirrors web FinanceChart's core:
// SVG line + soft area fill + a "today" dot + sparse x-axis labels). The goal
// target line / "set a goal" CTA are a later increment (needs goals data here).
const W = 320
const H = 132
const PAD_X = 12
const PAD_TOP = 14
const PAD_BOTTOM = 22

export default function FinanceChart({ month, transactions }) {
  const { path, area, todayX, todayY, labels, finalIncome } = useMemo(() => {
    const buckets = financeDailyBuckets(month.getFullYear(), month.getMonth(), { source: transactions })
    const { daysInMonth, cumInc } = buckets
    const today = new Date()
    const isCurrent = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
    const todayIdx = isCurrent ? Math.min(today.getDate() - 1, daysInMonth - 1) : daysInMonth - 1
    let mx = Math.max(...cumInc, 0)
    const mn = Math.min(...cumInc, 0)
    if (mx === mn) mx = mn + 1
    mx += (mx - mn) * 0.08
    const stepX = (W - PAD_X * 2) / Math.max(1, daysInMonth - 1)
    const yScale = (v) => PAD_TOP + (1 - (v - mn) / (mx - mn || 1)) * (H - PAD_TOP - PAD_BOTTOM)
    let p = ''
    cumInc.forEach((v, i) => { const x = PAD_X + i * stepX; const y = yScale(v); p += (p === '' ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1) })
    let a = ''
    if (p) { const lastX = PAD_X + (cumInc.length - 1) * stepX; const baseY = H - PAD_BOTTOM; a = p + ` L${lastX.toFixed(1)},${baseY.toFixed(1)} L${PAD_X.toFixed(1)},${baseY.toFixed(1)} Z` }
    const labelDays = [...new Set([1, 7, 14, 21, daysInMonth].filter((d) => d >= 1 && d <= daysInMonth))]
    return {
      path: p, area: a,
      todayX: PAD_X + todayIdx * stepX, todayY: yScale(cumInc[todayIdx] || 0),
      labels: labelDays.map((d) => ({ d, x: PAD_X + (d - 1) * stepX })),
      finalIncome: cumInc[cumInc.length - 1] || 0,
    }
  }, [month, transactions])

  return (
    <Card contentStyle={styles.wrap}>
      <View style={styles.head}>
        <Sparkles size={14} strokeWidth={1.6} color={colors.textSub} />
        <Text style={styles.title}>{i18n.t('finance:chart.title', { defaultValue: 'קצב ההכנסה' })}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.total}>{isr(finalIncome)}</Text>
      </View>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {area ? <Path d={area} fill={colors.brand} fillOpacity={0.10} /> : null}
        {path ? <Path d={path} stroke={colors.brand} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
        {path ? <Circle cx={todayX} cy={todayY} r={4.5} fill={colors.brand} /> : null}
        {labels.map((l) => (
          <SvgText key={l.d} x={l.x} y={H - 6} fontSize={9} fill={colors.textFaint} textAnchor="middle">{l.d}</SvgText>
        ))}
      </Svg>
    </Card>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 16, paddingHorizontal: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 13, fontWeight: '600', color: colors.text },
  total: { fontSize: 13, fontWeight: '600', color: colors.brand },
})
