import { useMemo, useState, useRef } from 'react'
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Share } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Svg, { Polyline, Circle } from 'react-native-svg'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import {
  BarChart3, Leaf, XCircle, ArrowRight, TrendingUp, Users, CircleCheck, CircleAlert,
  Calendar, ArrowDownCircle, ArrowUpCircle, Coins, Check, Eye, Settings, Download, ArrowUp, ArrowDown,
} from 'lucide-react-native'
import {
  REPORT_GROUPS, computeReportForRange, getLast12Months, formatReportValue, getOrderedVisibleMetrics,
  getPreviousPeriod, computeReportDelta, reportDeltaTone, formatReportDelta, reportExportValue, REPORT_METRICS,
} from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import InfoPopover from '../components/InfoPopover'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'
import { useReportsData } from '../hooks/useReportsData'
import { useReportsConfig } from '../hooks/useReportsConfig'
import ReportDrillSheet from '../modals/ReportDrillSheet'
import ReportsCustomizeSheet from '../modals/ReportsCustomizeSheet'
import { csvCell } from '../lib/csv'
import { useBottomPad } from '../lib/bottomBar'

const METRIC_ICONS = {
  newInquiries: Leaf, leadsClosed: XCircle, leadsConverted: ArrowRight, conversionRate: TrendingUp,
  newClients: Users, activeClientsAtEnd: CircleCheck, leftMidProcessPct: CircleAlert,
  sessions: Calendar, income: ArrowDownCircle, expense: ArrowUpCircle, net: Coins,
  tasksCompleted: Check, openTasksAtEnd: CircleAlert,
}

/* Twelve months of one metric as a 40×16 line (web MetricSpark): gaps skipped,
   not drawn as zero; nothing under two real points; its own min/max, so it
   shows the shape of the year — the number beside it carries the size. */
function Spark({ series, selectedIdx }) {
  const W = 40, H = 16, PAD = 2
  const pts = series.map((v, i) => ({ i, v })).filter((pt) => typeof pt.v === 'number')
  if (pts.length < 2) return <View style={styles.sparkNone} />
  const vals = pts.map((pt) => pt.v)
  const min = Math.min(...vals), max = Math.max(...vals)
  const x = (i) => PAD + (i / (series.length - 1)) * (W - 2 * PAD)
  const y = (v) => (max === min ? H / 2 : H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD))
  const here = pts.find((pt) => pt.i === selectedIdx)
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polyline points={pts.map((pt) => `${x(pt.i)},${y(pt.v)}`).join(' ')} fill="none" stroke={colors.moonDeep} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />
      {here ? <Circle cx={x(here.i)} cy={y(here.v)} r={2} fill={colors.moonDeep} /> : null}
    </Svg>
  )
}

/* Change against the month before: the arrow is the direction, the colour is
   whether that was good (more expenses points up and reads red; "leads
   closed" has no good direction). Nothing when either month has no value. */
function Delta({ metric, current, previous }) {
  const delta = computeReportDelta(current, previous)
  if (delta === null) return <View style={styles.deltaSlot} />
  const tone = reportDeltaTone(metric, delta)
  const color = tone === 'good' ? colors.positive : tone === 'bad' ? colors.danger : colors.textSub
  const Arrow = delta > 0 ? ArrowUp : ArrowDown
  return (
    <View style={[styles.deltaSlot, styles.delta]}>
      {delta !== 0 ? <Arrow size={10} strokeWidth={2.2} color={color} /> : null}
      <Text style={[styles.deltaText, { color }]} numberOfLines={1}>{formatReportDelta(metric, delta)}</Text>
    </View>
  )
}

// Reports (web ReportsScreen, list view): pick a month → the shared report
// engine computes every metric, grouped by domain, in the user's saved layout
// (prefs.reports — the same one web edits, and editable here). Each figure
// carries a twelve-month sparkline and its change from the month before, and
// opens the rows behind it. Export shares the month as CSV. The table view
// stays on web.
export default function ReportsScreen() {
  const bottomPad = useBottomPad()
  const nav = useNavigation()
  const { leads, clients, sessions, transactions, tasks, groupMembers, groups, tallies, loading, error, refetch } = useReportsData()
  const { config, toggleMetric, moveMetric, resetMetrics } = useReportsConfig()
  const lang = i18n.language
  /* Rebuilt with the language, so month names follow a switch; the choice is
     held as {year, month} so it survives the rebuild. */
  const periods = useMemo(() => getLast12Months(new Date(), lang), [lang])
  const [selectedKey, setSelectedKey] = useState(() => ({ year: periods[periods.length - 1].year, month: periods[periods.length - 1].month }))
  const found = periods.findIndex((pp) => pp.year === selectedKey.year && pp.month === selectedKey.month)
  // Falls back to the newest month if the chosen one leaves the 12-month window (midnight on the 1st).
  const idx = found < 0 ? periods.length - 1 : found
  const period = periods[idx]
  const setIdx = (i) => setSelectedKey({ year: periods[i].year, month: periods[i].month })
  const [drill, setDrill] = useState(null)
  const [customizing, setCustomizing] = useState(false)
  const pillsRef = useRef(null)
  const pillsPlaced = useRef(false)

  const data = useMemo(
    () => ({ leads, clients, sessions, transactions, tasks, groupMembers, groups, tallies }),
    [leads, clients, sessions, transactions, tasks, groupMembers, groups, tallies],
  )
  /* All twelve months once — the card, the change, the suggestion and the sparklines read from it. */
  const monthly = useMemo(() => periods.map((pp) => computeReportForRange(pp.start, pp.end, data)), [periods, data])
  const report = monthly[idx]
  const prevPeriod = useMemo(() => getPreviousPeriod(period, lang), [period, lang])
  const prevReport = useMemo(
    () => (idx > 0 ? monthly[idx - 1] : computeReportForRange(prevPeriod.start, prevPeriod.end, data)),
    [idx, monthly, prevPeriod, data],
  )
  const ordered = useMemo(() => getOrderedVisibleMetrics(config), [config])
  const grouped = useMemo(() => REPORT_GROUPS
    .map((g) => ({ ...g, items: ordered.filter((m) => m.group === g.id) }))
    .filter((g) => g.items.length), [ordered])
  const metricVal = (id) => report?.metrics?.[id]
  // Whole month with no data → offer the most recent month that has some (web parity).
  const isEmpty = ordered.every((m) => { const v = report?.metrics?.[m.id]; return v == null || v === 0 })
  const suggested = useMemo(() => {
    if (!isEmpty) return null
    for (let i = periods.length - 1; i >= 0; i -= 1) {
      if (i === idx) continue
      if (ordered.some((m) => { const v = monthly[i].metrics[m.id]; return v != null && v !== 0 })) return { i, label: periods[i].label }
    }
    return null
  }, [isEmpty, periods, idx, ordered, monthly])

  /* Hidden metrics are sticky and silent — the cog wears a dot while any are. */
  const someHidden = config.visibleMetrics.length < REPORT_METRICS.length
  const cogLabel = someHidden
    ? i18n.t('reports:customize.labelHidden', { shown: config.visibleMetrics.length, total: REPORT_METRICS.length })
    : i18n.t('reports:customize.label')

  /* The month as a spreadsheet: the visible metrics in the saved order, the
     month's figure and its change — what the screen shows. */
  const exportMonth = async () => {
    const header = [i18n.t('reports:exportHeaders.metric'), period.label, i18n.t('reports:exportHeaders.change')]
    const rows = ordered.map((m) => [
      i18n.t(`reports:metrics.${m.id}`),
      reportExportValue(m, metricVal(m.id)),
      reportExportValue(m, computeReportDelta(metricVal(m.id), prevReport?.metrics?.[m.id])),
    ])
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
    try { await Share.share({ message: csv, title: period.label }) } catch { /* cancelled / unsupported */ }
  }

  return (
    <Screen name="finance">
      <ReportDrillSheet drill={drill} data={data} onClose={() => setDrill(null)} />
      <ReportsCustomizeSheet open={customizing} onClose={() => setCustomizing(false)} config={config} onToggle={toggleMetric} onMove={moveMetric} onReset={resetMetrics} />
      {loading && !clients.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, bottomPad]} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          <ScreenHead
            title={i18n.t('reports:title', { defaultValue: 'דוחות' })}
          />
          <View style={styles.controls}>
            <Pressable style={styles.ctrlLink} onPress={() => nav.navigate('Moon')} accessibilityRole="link">
              <Eye size={15} strokeWidth={1.6} color={colors.brand} />
              <Text style={styles.ctrlLinkText}>{i18n.t('reports:moonGlance')}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {!error ? (
              <Pressable style={styles.ctrlLink} onPress={exportMonth} accessibilityRole="button" accessibilityLabel={i18n.t('reports:exportAria')}>
                <Download size={15} strokeWidth={1.7} color={colors.textSub} />
                <Text style={styles.ctrlText}>{i18n.t('reports:exportLabel')}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.cog} onPress={() => setCustomizing(true)} accessibilityRole="button" accessibilityLabel={cogLabel} hitSlop={6}>
              <Settings size={17} strokeWidth={1.6} color={colors.textSub} />
              {someHidden ? <View style={styles.cogDot} /> : null}
            </Pressable>
          </View>
          {/* A failed read falls back to empty tables, so every metric computes
              as 0 and the screen used to say the month had no activity — a false
              statement about the coach's business. Say what happened instead and
              draw no report (web ReportsScreen). */}
          {error ? (
            <View style={styles.emptyBox}>
              <BarChart3 size={28} strokeWidth={1.3} color={colors.textFaint} />
              <Text style={styles.emptyText}>{i18n.t('reports:loadError')}</Text>
              <Pressable style={styles.emptyCta} onPress={() => refetch()}>
                <Text style={styles.emptyCtaText}>{i18n.t('reports:retry')}</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Month selector — opens on the newest month, which is the far end of the strip. */}
          <ScrollView
            ref={pillsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pills}
            accessibilityLabel={i18n.t('reports:list.selectMonthAria')}
            onContentSizeChange={() => { if (!pillsPlaced.current) { pillsPlaced.current = true; pillsRef.current?.scrollToEnd?.({ animated: false }) } }}
          >
            {periods.map((pp, i) => {
              const on = i === idx
              return (
                <Pressable key={`${pp.year}-${pp.month}`} style={[styles.pill, on && styles.pillOn]} onPress={() => setIdx(i)} accessibilityState={{ selected: on }}>
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{pp.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {error ? null : isEmpty ? (
            <View style={styles.emptyBox}>
              <BarChart3 size={28} strokeWidth={1.3} color={colors.textFaint} />
              <Text style={styles.emptyText}>{i18n.t('reports:list.empty', { defaultValue: 'אין נתונים לחודש הזה' })}</Text>
              {suggested ? (
                <Pressable style={styles.emptyCta} onPress={() => setIdx(suggested.i)}>
                  <Text style={styles.emptyCtaText}>{i18n.t('reports:list.goToMonth', { label: suggested.label, defaultValue: `← עבור ל${suggested.label}` })}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : grouped.map((g) => (
            <View key={g.id} style={styles.group}>
              <Card padded={false}>
                <Text style={styles.groupTitle}>{i18n.t(`reports:groups.${g.id}`)}</Text>
                {g.items.map((m, i) => {
                  const Icon = METRIC_ICONS[m.id] || BarChart3
                  const v = metricVal(m.id)
                  const empty = v == null || v === 0
                  const neg = m.format === 'money' && typeof v === 'number' && v < 0
                  return (
                    <View key={m.id} style={[styles.row, i > 0 && styles.rowBorder, empty && styles.rowEmpty]}>
                      <Pressable
                        style={styles.rowPress}
                        onPress={() => setDrill({ metricId: m.id, period })}
                        disabled={empty}
                        accessibilityRole="button"
                        accessibilityHint={i18n.t('reports:list.deltaTitle', { period: prevPeriod.label, value: formatReportValue(m, prevReport?.metrics?.[m.id]) })}
                      >
                        <Icon size={15} strokeWidth={1.6} color={colors.textSub} />
                        <Text style={styles.rowLabel} numberOfLines={2}>{i18n.t(`reports:metrics.${m.id}`)}</Text>
                        <Spark series={monthly.map((r) => r.metrics[m.id])} selectedIdx={idx} />
                        <Text style={[styles.rowValue, neg && styles.rowValueNeg]}>{formatReportValue(m, v)}</Text>
                        <Delta metric={m} current={v} previous={prevReport?.metrics?.[m.id]} />
                      </Pressable>
                      {m.info ? <InfoPopover label={i18n.t('reports:info', { label: i18n.t(`reports:metrics.${m.id}`) })} text={i18n.t(`reports:metricsDesc.${m.id}`)} /> : null}
                    </View>
                  )
                })}
              </Card>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = themed((c, t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 16 },
  error: { color: c.danger, fontSize: 13 },
  pills: { gap: 8, paddingVertical: 2 },
  pill: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  pillOn: { backgroundColor: c.text, borderColor: c.text },
  pillText: { fontSize: 13, color: c.textSub },
  // Inverse of the c.text fill so it reads in both themes (white would vanish
  // on the cream dark-mode fill).
  pillTextOn: { color: c.bg, fontWeight: '600' },
  group: { gap: 8 },
  groupTitle: { fontSize: 11, fontWeight: '600', color: c.textSub, letterSpacing: 0.4, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.fill, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingEnd: 12 },
  rowPress: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingStart: 16 },
  rowValueNeg: { color: c.danger },
  sparkNone: { width: 40, height: 16 },
  deltaSlot: { width: 58 },
  delta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  deltaText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -8 },
  ctrlLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 },
  ctrlLinkText: { fontSize: 13, fontWeight: '500', color: c.brand },
  ctrlText: { fontSize: 13, color: c.textSub },
  cog: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  cogDot: { position: 'absolute', top: 8, end: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: c.brand },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  rowLabel: { flex: 1, fontSize: 13, color: c.text },
  rowValue: { fontSize: 13, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
  rowEmpty: { opacity: 0.6 }, // web .rep-row.empty — a 0/null metric reads dimmed
  emptyBox: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  emptyText: { fontSize: 14, color: c.textFaint, textAlign: 'center' },
  emptyCta: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.border },
  emptyCtaText: { fontSize: 13, fontWeight: '500', color: c.brand },
}))
