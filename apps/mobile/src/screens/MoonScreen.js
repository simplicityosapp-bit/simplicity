import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Svg, { Circle, Path, Polygon } from 'react-native-svg'
import { moonGetData, moonGetCategories, moonTrend, moonReflection, buildOverviewCorrelations, buildOverviewTrend, OVERVIEW_METRICS, questionText } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Select from '../components/Select'
import { colors } from '../theme/theme'
import { useGoalsData } from '../hooks/useGoalsData'

// Moon screen ("מבט על", mirrors web moon-glance core): a confidence ring +
// reflection, per-category pace/goal dual bars, and a 30-day trend line with
// avg/peak/today, plus the guarded cross-module correlations (§8.2).
const RING = 46
const CIRC = 2 * Math.PI * RING
// Metric toggles for the cross-module trend overlay (§8.1).
const OVERVIEW_PILLS = [
  { key: 'income', labelKey: 'moon:pills.income' },
  { key: 'leads', labelKey: 'moon:pills.leads' },
  { key: 'sessions', labelKey: 'moon:pills.sessions' },
  { key: 'score', labelKey: 'moon:pills.score' },
  { key: 'question', labelKey: 'moon:pills.question' },
]
const dayKeyOf = (d) => {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export default function MoonScreen() {
  const nav = useNavigation()
  const { goals, categories, entries, transactions, clients, leads, answers, members, groups, sessions, questions, loading, error, refetch } = useGoalsData()
  const data = useMemo(
    () => ({ goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])
  const cats = useMemo(() => moonGetCategories(new Date(), data), [data])
  const trend = useMemo(() => moonTrend(30, new Date(), data), [data])
  // Guarded cross-module correlations (§8.2) — Spearman + permutation + FDR over a
  // 30-day window; the common (and correct) result is an empty list.
  const activeQuestions = useMemo(() => (questions || []).filter((q) => q.active), [questions])
  const correlations = useMemo(
    () => buildOverviewCorrelations({ transactions, leads, sessions, answers }, { questions: activeQuestions, window: 30 }),
    [transactions, leads, sessions, answers, activeQuestions],
  )
  // Cross-module trend overlay (§8.1) — one self-normalized (0-100) line per metric.
  const [overviewKeys, setOverviewKeys] = useState(['income', 'score'])
  const [questionId, setQuestionId] = useState('')
  const toggleOverviewKey = (k) => {
    setOverviewKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
    if (k === 'question' && !questionId && activeQuestions.length) setQuestionId(activeQuestions[0].id)
  }
  const scoreByDay = useMemo(() => {
    const m = {}
    trend.forEach((t) => { m[dayKeyOf(t.date)] = t.score })
    return m
  }, [trend])
  const selectedQuestion = activeQuestions.find((q) => q.id === questionId)
  const overview = useMemo(
    () => buildOverviewTrend(overviewKeys, { transactions, leads, sessions, answers, scoreByDay, questionId: questionId || null }, { window: 30, questionLabel: selectedQuestion ? questionText(selectedQuestion) : undefined }),
    [overviewKeys, transactions, leads, sessions, answers, scoreByDay, questionId, selectedQuestion],
  )

  const scores = trend.map((t) => t.score)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const peak = scores.length ? Math.max(...scores) : 0
  const conf = overall?.confidence ?? 0
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRC

  // 30-day trend line (0-100 scored).
  const chart = useMemo(() => {
    const W = 300, H = 84, pad = 5
    if (trend.length < 2) return null
    const pts = trend.map((d, i) => [pad + (i / (trend.length - 1)) * (W - 2 * pad), H - pad - (d.score / 100) * (H - 2 * pad)])
    const line = pts.map((p) => p.map((n) => Math.round(n * 10) / 10).join(',')).join(' ')
    return { W, H, line, area: `${pad},${H - pad} ${line} ${W - pad},${H - pad}`, d: 'M' + pts.map((p) => p.join(',')).join(' L') }
  }, [trend])

  return (
    <Screen name="moon">
      {loading && !overall ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : !overall ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{i18n.t('moon:empty.noGoals', { action: i18n.t('moon:empty.action', { defaultValue: 'הגדר/י' }), defaultValue: 'עדיין אין יעדים.' })}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => nav.navigate('Goals')}><Text style={styles.emptyBtnText}>{i18n.t('goals:newGoal', { defaultValue: 'יעד חדש' })}</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead title={i18n.t('moon:title', { defaultValue: 'מבט על' })} />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Hero ring + reflection */}
          <Card contentStyle={styles.hero}>
            <View style={styles.ringWrap}>
              <Svg width={132} height={132} viewBox="0 0 100 100" style={styles.ringSvg}>
                <Circle cx="50" cy="50" r={RING} fill="none" stroke={colors.divider} strokeWidth={5} />
                <Circle cx="50" cy="50" r={RING} fill="none" stroke={colors.moonDeep} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${dash} ${CIRC}`} />
              </Svg>
              <Text style={styles.ringNum}>{conf}%</Text>
              <Text style={styles.ringKicker}>{i18n.t('moon:ring.kicker', { defaultValue: 'מהקצב' })}</Text>
            </View>
            <Text style={styles.ringSub}>{i18n.t('moon:ring.sub', { pct: overall.pure, defaultValue: `${overall.pure}% מהיעד` })}</Text>
            <Text style={styles.reflection}>{moonReflection(conf)}</Text>
          </Card>

          {/* By category */}
          {cats.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionH}>{i18n.t('moon:section.byCategory', { defaultValue: 'פירוק לפי קטגוריה' })}</Text>
              <Card contentStyle={styles.catCard}>
                {cats.map((c, i) => (
                  <View key={c.category.id} style={[styles.cat, i > 0 && styles.catBorder]}>
                    <View style={styles.catHead}>
                      <View style={[styles.catDot, { backgroundColor: c.category.color || colors.moonDeep }]} />
                      <Text style={styles.catName} numberOfLines={1}>{c.category.name}</Text>
                    </View>
                    <DualBar label={i18n.t('moon:dualBars.pace', { defaultValue: 'מהקצב' })} pct={c.confidence} color={colors.positive} />
                    <DualBar label={i18n.t('moon:dualBars.goal', { defaultValue: 'מהיעד' })} pct={c.pure} color={colors.moonDeep} />
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {/* Trend */}
          {chart ? (
            <View style={styles.section}>
              <Text style={styles.sectionH}>{i18n.t('moon:section.trend', { defaultValue: 'המגמה לאורך זמן' })}</Text>
              <Card contentStyle={styles.trendCard}>
                <Svg viewBox={`0 0 ${chart.W} ${chart.H}`} width="100%" height={chart.H}>
                  <Polygon points={chart.area} fill={colors.moon} fillOpacity={0.14} />
                  <Path d={chart.d} stroke={colors.moonDeep} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                </Svg>
                <View style={styles.trendStats}>
                  <TrendStat value={`${avg}%`} label={i18n.t('moon:trend.avg', { defaultValue: 'ממוצע' })} />
                  <TrendStat value={`${peak}%`} label={i18n.t('moon:trend.peak', { defaultValue: 'שיא' })} divided />
                  <TrendStat value={`${conf}%`} label={i18n.t('moon:trend.today', { defaultValue: 'היום' })} />
                </View>
              </Card>
            </View>
          ) : null}

          {/* Cross-module trend overlay (§8.1) — self-normalized lines per metric */}
          <View style={styles.section}>
            <Text style={styles.sectionH}>{i18n.t('moon:section.crossModule', { defaultValue: 'מגמות בין מודולים' })}</Text>
            <View style={styles.ovPills}>
              {OVERVIEW_PILLS.map((m) => {
                const on = overviewKeys.includes(m.key)
                const disabled = m.key === 'question' && activeQuestions.length === 0
                return (
                  <Pressable key={m.key} disabled={disabled} style={[styles.ovPill, on && styles.ovPillOn, disabled && styles.ovPillOff]} onPress={() => toggleOverviewKey(m.key)}>
                    <View style={[styles.ovDot, { backgroundColor: OVERVIEW_METRICS[m.key].color }]} />
                    <Text style={[styles.ovPillText, on && styles.ovPillTextOn]}>{i18n.t(m.labelKey)}</Text>
                  </Pressable>
                )
              })}
            </View>
            {overviewKeys.includes('question') && activeQuestions.length > 0 ? (
              <Select value={questionId} onChange={setQuestionId} options={activeQuestions.map((q) => ({ value: q.id, label: questionText(q) }))} />
            ) : null}
            <Card contentStyle={styles.ovCard}>
              <MultiTrendChart days={overview.days} series={overview.series} />
            </Card>
            <Text style={styles.corrNote}>{i18n.t('moon:overview.note')}</Text>
          </View>

          {/* Guarded correlations (§8.2) — "patterns to explore", never headlines */}
          <View style={styles.section}>
            <Text style={styles.sectionH}>{i18n.t('moon:section.correlations', { defaultValue: 'קשרים לבדיקה' })}</Text>
            {correlations.length === 0 ? (
              <Card contentStyle={styles.corrEmptyCard}>
                <Text style={styles.corrEmpty}>{i18n.t('moon:corr.empty')}</Text>
              </Card>
            ) : (
              <>
                {correlations.map((c) => <CorrCard key={c.key} c={c} />)}
                <Text style={styles.corrNote}>{i18n.t('moon:corr.note')}</Text>
              </>
            )}
          </View>

          <Pressable style={styles.footerLink} onPress={() => nav.navigate('Goals')}>
            <Text style={styles.footerLinkText}>{i18n.t('moon:footerLink', { defaultValue: 'לניהול היעדים' })}</Text>
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  )
}

function DualBar({ label, pct, color }) {
  const w = Math.min(100, Math.max(0, pct ?? 0))
  return (
    <View style={styles.dualRow}>
      <Text style={styles.dualLabel}>{label}</Text>
      <View style={styles.dualTrack}><View style={[styles.dualFill, { width: `${w}%`, backgroundColor: color }]} /></View>
      <Text style={styles.dualPct}>{w}%</Text>
    </View>
  )
}
function TrendStat({ value, label, divided }) {
  return (
    <View style={[styles.trendStat, divided && styles.trendStatDivided]}>
      <Text style={styles.trendStatV}>{value}</Text>
      <Text style={styles.trendStatL}>{label}</Text>
    </View>
  )
}

// Render an i18n string whose <0>…</0>/<1>…</1> spans (driver/outcome) are bold —
// mirrors the web <Trans> with <b> components.
function taggedLine(raw) {
  return raw.split(/<\/?[01]>/).map((part, i) => (i % 2 === 1
    ? <Text key={i} style={styles.corrBold}>{part}</Text>
    : part))
}

// Honest little scatter so the spread is visible, not just a number (min-max scaled).
function Scatter({ points }) {
  if (!points || points.length < 3) return null
  const W = 120, H = 78, PAD = 6
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys)
  const sx = (x) => (xmax === xmin ? W / 2 : PAD + ((x - xmin) / (xmax - xmin)) * (W - 2 * PAD))
  const sy = (y) => (ymax === ymin ? H / 2 : H - PAD - ((y - ymin) / (ymax - ymin)) * (H - 2 * PAD))
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {points.map((p, i) => <Circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.2} fill={colors.moonDeep} fillOpacity={0.7} />)}
    </Svg>
  )
}

// One "pattern to explore" — symmetric co-movement phrasing (never "X drives Y").
function CorrCard({ c }) {
  const driver = questionText(c.driverLabel)
  const outcome = c.outcomeLabel || (c.outcomeQ ? questionText(c.outcomeQ) : '')
  const raw = i18n.t(c.direction === 'pos' ? 'moon:corr.moveTogether' : 'moon:corr.moveOpposite', { driver, outcome })
  return (
    <Card contentStyle={styles.corrCard}>
      <View style={styles.corrText}>
        <Text style={styles.corrLine}>{taggedLine(raw)}</Text>
        <Text style={styles.corrSub}>{i18n.t('moon:corr.sub', { strength: c.strength, n: c.n })}</Text>
      </View>
      <Scatter points={c.points} />
    </Card>
  )
}

// Overlaid self-normalized (0-100) multi-line trend (mirrors web MultiTrendChart):
// each metric is drawn to its own min/max; nulls break the line into gaps.
const MT_W = 300, MT_H = 110, MT_PAD = 6
function pathFor(norm) {
  const n = norm.length
  if (n < 2) return ''
  let d = '', pen = false
  norm.forEach((v, i) => {
    if (v == null) { pen = false; return }
    const x = MT_PAD + (i / (n - 1)) * (MT_W - 2 * MT_PAD)
    const y = MT_H - MT_PAD - (v / 100) * (MT_H - 2 * MT_PAD)
    d += `${pen ? 'L' : 'M'}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10} `
    pen = true
  })
  return d.trim()
}
function fmtRaw(v, unit) {
  if (v == null) return '—'
  const num = unit === '₪' ? Math.round(v).toLocaleString('he-IL') : Math.round(v * 10) / 10
  return unit ? `${num} ${unit}` : `${num}`
}
function MultiTrendChart({ days, series }) {
  const drawable = (series || []).filter((s) => s.norm.some((v) => v != null))
  if (drawable.length === 0 || (days?.length || 0) < 2) {
    return <Text style={styles.ovEmpty}>{i18n.t('reports:trend.empty', { defaultValue: 'אין מספיק נתונים לגרף עדיין.' })}</Text>
  }
  return (
    <View style={styles.mtWrap}>
      <Svg viewBox={`0 0 ${MT_W} ${MT_H}`} width="100%" height={MT_H}>
        {drawable.map((s) => (
          <Path key={s.key} d={pathFor(s.norm)} stroke={s.color} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </Svg>
      <View style={styles.mtLegend}>
        {drawable.map((s) => (
          <View key={s.key} style={styles.mtLegendItem}>
            <View style={[styles.mtLegendDot, { backgroundColor: s.color }]} />
            <Text style={styles.mtLegendLabel} numberOfLines={1}>{s.label}</Text>
            <Text style={styles.mtLegendVal}>{fmtRaw(s.summary, s.unit)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.brand },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },

  hero: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  ringWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { ...StyleSheet.absoluteFillObject, transform: [{ rotate: '-90deg' }] },
  ringNum: { fontSize: 28, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  ringKicker: { fontSize: 11, color: colors.textSub, marginTop: 1 },
  ringSub: { fontSize: 12, color: colors.textSub },
  reflection: { fontSize: 13, color: colors.text, textAlign: 'center', lineHeight: 19, marginTop: 4, paddingHorizontal: 6 },

  section: { gap: 8 },
  sectionH: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: colors.textSub, letterSpacing: 0.6, backgroundColor: colors.fillStrong, paddingVertical: 3, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  catCard: { paddingVertical: 4, paddingHorizontal: 16 },
  cat: { paddingVertical: 12, gap: 8 },
  catBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  catName: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
  dualRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dualLabel: { fontSize: 11, color: colors.textSub, width: 42 },
  dualTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.fillStrong, overflow: 'hidden' },
  dualFill: { height: 7, borderRadius: 4 },
  dualPct: { fontSize: 11, color: colors.textSub, width: 34, textAlign: 'right' },

  trendCard: { paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
  trendStats: { flexDirection: 'row' },
  trendStat: { flex: 1, alignItems: 'center', gap: 3 },
  trendStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  trendStatV: { fontSize: 18, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  trendStatL: { fontSize: 10, color: colors.textSub, textTransform: 'uppercase', letterSpacing: 0.3 },

  footerLink: { alignSelf: 'center', paddingVertical: 8 },
  footerLinkText: { fontSize: 13, color: colors.brand, fontWeight: '500' },

  corrEmptyCard: { paddingVertical: 16, paddingHorizontal: 18 },
  corrEmpty: { fontSize: 13, color: colors.textSub, lineHeight: 19 },
  corrCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  corrText: { flex: 1, gap: 4 },
  corrLine: { fontSize: 13, color: colors.text, lineHeight: 19 },
  corrBold: { fontWeight: '700', color: colors.text },
  corrSub: { fontSize: 11, color: colors.textFaint },
  corrNote: { fontSize: 11, color: colors.textFaint, lineHeight: 16, paddingHorizontal: 4 },

  ovPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ovPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  ovPillOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  ovPillOff: { opacity: 0.4 },
  ovDot: { width: 8, height: 8, borderRadius: 4 },
  ovPillText: { fontSize: 12, color: colors.textSub },
  ovPillTextOn: { color: colors.text, fontWeight: '600' },
  ovCard: { paddingVertical: 14, paddingHorizontal: 12, gap: 10 },
  ovEmpty: { fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 20 },
  mtWrap: { gap: 10 },
  mtLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mtLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mtLegendDot: { width: 8, height: 8, borderRadius: 4 },
  mtLegendLabel: { fontSize: 11, color: colors.textSub, maxWidth: 90 },
  mtLegendVal: { fontSize: 11, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
})

DualBar.displayName = 'DualBar'
TrendStat.displayName = 'TrendStat'
Scatter.displayName = 'Scatter'
CorrCard.displayName = 'CorrCard'
MultiTrendChart.displayName = 'MultiTrendChart'
