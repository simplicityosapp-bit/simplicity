import { useMemo, useState } from 'react'
import { View } from 'react-native'
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg'
import { Sparkles, ArrowLeft } from 'lucide-react-native'
import { financeDailyBuckets, getMonthlyIncomeGoal, netChartGeometry, isr, CHART_W_DEFAULT, CHART_H, CHART_PAD_X } from '@simplicity/core'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import Card from '../../components/Card'
import InfoPopover from '../../components/InfoPopover'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

/* ════════════════════════════════════════════════════════════════
   The month's cumulative NET, day by day (web FinanceChart).
   ════════════════════════════════════════════════════════════════
   The line plots income − expenses, so it can fall as well as rise and
   ends on the same figure the card above prints. The phone used to plot
   income, fill to the bottom edge, and show no goal.

   With `goals` passed (the finance screen): the monthly income goal is a
   marker on the Y axis — pinned to the edge as a caret when it is beyond
   the drawn range — and the header chip carries the exact income-vs-goal
   figure; with no goal set, a nudge to set one. Without `goals` (a
   project's own chart) the goal parts stay away.

   The geometry is core netChartGeometry, the same one web draws from; the
   width is measured so one unit is one point and the labels don't smear.
   ════════════════════════════════════════════════════════════════ */
export default function FinanceChart({ month, transactions, goals, goalCategories, onSetGoal }) {
  const [width, setWidth] = useState(CHART_W_DEFAULT)
  const withGoal = Array.isArray(goals)
  const goal = useMemo(() => (withGoal ? getMonthlyIncomeGoal(goals, goalCategories || []) : null), [withGoal, goals, goalCategories])
  const target = goal?.target_value || 0
  const goalProjectId = goal?.project_id || null

  const view = useMemo(() => {
    const { daysInMonth, cumInc, cumNet } = financeDailyBuckets(month.getFullYear(), month.getMonth(), { projectId: goalProjectId, source: transactions })
    const today = new Date()
    const isCurrent = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
    const todayIdx = isCurrent ? Math.min(today.getDate() - 1, daysInMonth - 1) : daysInMonth - 1
    const geo = netChartGeometry({ cumNet, daysInMonth, targetValue: target, todayIdx, width })
    const labelDays = [...new Set([1, 7, 14, 21, daysInMonth].filter((d) => d >= 1 && d <= daysInMonth))]
    return { ...geo, labels: labelDays.map((d) => ({ d, x: CHART_PAD_X + (d - 1) * geo.stepX })), finalIncome: cumInc[cumInc.length - 1] || 0 }
  }, [month, transactions, goalProjectId, target, width])

  const pct = target > 0 ? Math.round((view.finalIncome / target) * 100) : null

  return (
    <Card contentStyle={styles.wrap}>
      <View style={styles.head}>
        <Sparkles size={14} strokeWidth={1.6} color={colors.textSub} />
        <Text style={styles.title}>{i18n.t('finance:chart.title')}</Text>
        <InfoPopover label={i18n.t('finance:chart.infoLabel')} text={i18n.t('finance:chart.infoText')} />
        <View style={{ flex: 1 }} />
        {/* The goal tracker stays on INCOME — that is what the goal measures. */}
        {pct != null ? (
          <Text style={[styles.chip, pct >= 100 && styles.chipDone]}>
            <Text style={styles.chipLbl}>{i18n.t('finance:chart.incomeGoalLabel')} </Text>
            {isr(view.finalIncome)} <Text style={styles.chipFrac}>/ {isr(target)}</Text>
          </Text>
        ) : null}
      </View>
      <View onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== width) setWidth(w) }}>
        <Svg viewBox={`0 0 ${width} ${CHART_H}`} width="100%" height={CHART_H} accessibilityLabel={i18n.t('finance:chart.svgAria')}>
          {view.showZeroLine ? (
            <Line x1={CHART_PAD_X} y1={view.zeroY} x2={width - CHART_PAD_X} y2={view.zeroY} stroke={colors.textFaint} strokeWidth={1} strokeDasharray="3 3" />
          ) : null}
          {view.goalY != null ? (
            view.goalClamped ? (
              <Path d={`M${CHART_PAD_X - 3},${(view.goalY + 4).toFixed(1)} L${CHART_PAD_X + 1},${view.goalY.toFixed(1)} L${CHART_PAD_X + 5},${(view.goalY + 4).toFixed(1)}`} stroke={colors.positive} strokeWidth={1.6} fill="none" />
            ) : (
              <>
                <Line x1={CHART_PAD_X} y1={view.goalY} x2={CHART_PAD_X + 14} y2={view.goalY} stroke={colors.positive} strokeWidth={2} />
                <Circle cx={CHART_PAD_X} cy={view.goalY} r={2.6} fill={colors.positive} />
              </>
            )
          ) : null}
          {view.area ? <Path d={view.area} fill={colors.brand} fillOpacity={0.10} /> : null}
          {view.path ? <Path d={view.path} stroke={colors.brand} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {view.path ? <Circle cx={view.todayX} cy={view.todayY} r={4.5} fill={colors.brand} /> : null}
          {view.labels.map((l) => (
            <SvgText key={l.d} x={l.x} y={CHART_H - 6} fontSize={9} fill={colors.textFaint} textAnchor="middle">{l.d}</SvgText>
          ))}
        </Svg>
      </View>
      {withGoal && target === 0 && onSetGoal ? (
        <Pressable style={styles.cta} onPress={onSetGoal} accessibilityRole="button">
          <Text style={styles.ctaText}>{i18n.t('finance:chart.setGoal')}</Text>
          <ArrowLeft size={14} strokeWidth={1.5} color={colors.brand} />
        </Pressable>
      ) : null}
    </Card>
  )
}

const styles = themed((c) => ({
  wrap: { paddingVertical: 16, paddingHorizontal: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontWeight: '600', color: c.text },
  chip: { fontSize: 12, fontWeight: '600', color: c.text },
  chipDone: { color: c.positive },
  chipLbl: { fontSize: 11, fontWeight: '400', color: c.textSub },
  chipFrac: { fontSize: 11, fontWeight: '400', color: c.textSub },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40 },
  ctaText: { fontSize: 13, fontWeight: '600', color: c.brand },
}))
