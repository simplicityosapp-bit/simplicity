import { useMemo, useState, useEffect } from 'react'
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, InteractionManager } from 'react-native'
import { BarChart3, Plus, ChevronDown, ChevronUp } from 'lucide-react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useNavigation } from '@react-navigation/native'
import Svg, { Circle, Path, Polygon } from 'react-native-svg'
import { moonGetData, moonGetCategories, moonTrend, moonReflection, buildOverviewCorrelations, buildOverviewTrend, OVERVIEW_METRICS, questionText, mergeSnapshotTrend, moonTrendStats, readMoonOverviewKeys } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Select from '../components/Select'
import InfoPopover from '../components/InfoPopover'
import AddGoalEntryModal from '../modals/AddGoalEntryModal'
import { usePreferences } from '../hooks/usePreferences'
import { useMoonSnapshots, useRecordMoonSnapshot } from '../hooks/useMoonSnapshots'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'
import { useGoalsData } from '../hooks/useGoalsData'
import { useBottomPad } from '../lib/bottomBar'

// Moon screen ("מבט על", mirrors web moon-glance): a confidence ring +
// reflection, each category with its goals' pace/goal bars (and "+" to log a
// manual goal's progress), a 30-day trend built from the recorded daily scores
// (moon_snapshots) over the live estimate, and — folded away until asked for —
// the cross-module overlay and the guarded correlations.
/* The correlations look back 120 days: their statistical gates need that many
   to ever pass (at 30 they essentially never do). The overlay stays 30. */
const OV_WINDOW = 30
const CORR_WINDOW = 120
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
/* Day.month for the charts' two ends — the span has to be visible for a line
   that starts partway through to mean anything. */
const shortDay = (d) => { const dt = d instanceof Date ? d : new Date(d); return `${dt.getDate()}.${dt.getMonth() + 1}` }
const dayKeyOf = (d) => {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export default function MoonScreen() {
  const bottomPad = useBottomPad()
  const nav = useNavigation()
  const { prefs, update } = usePreferences()
  const gender = prefs?.design?.gender
  const { goals, categories, entries, transactions, clients, leads, answers, members, groups, sessions, questions, loading, error, refetch, addEntry } = useGoalsData()
  const data = useMemo(
    () => ({ goals, categories, entries, transactions, clients, leads, answers, members, groups }),
    [goals, categories, entries, transactions, clients, leads, answers, members, groups],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])
  // Record today's score from here too, so opening this screen alone still adds a day.
  useRecordMoonSnapshot(overall, !loading && !error)
  const cats = useMemo(() => moonGetCategories(new Date(), data), [data])
  const liveTrend = useMemo(() => moonTrend(30, new Date(), data), [data])
  const snapshots = useMoonSnapshots(30)
  /* Recorded days laid over the live estimate (core mergeSnapshotTrend) — the
     phone drew the estimate alone, so a day's real score never showed. */
  const trend = useMemo(() => mergeSnapshotTrend(liveTrend, snapshots), [liveTrend, snapshots])
  const stats = moonTrendStats(trend)
  const [entryTarget, setEntryTarget] = useState(null)
  const [deepOpen, setDeepOpen] = useState(false)

  const activeQuestions = useMemo(() => (questions || []).filter((q) => q.active), [questions])
  /* The overlay's metrics and question ride in preferences (as on web), so a
     coach who watches sessions doesn't re-pick them on every visit. */
  const overviewKeys = useMemo(() => readMoonOverviewKeys(prefs), [prefs])
  const questionId = activeQuestions.some((q) => q.id === prefs?.moonOverviewQuestion)
    ? prefs.moonOverviewQuestion
    : (activeQuestions[0]?.id || '')
  const toggleOverviewKey = (k) => Promise.resolve(update((cur) => {
    const list = readMoonOverviewKeys(cur)
    return { moonOverviewKeys: list.includes(k) ? list.filter((x) => x !== k) : [...list, k] }
  })).catch(() => {})
  const scoreByDay = useMemo(() => {
    const m = {}
    trend.forEach((t) => { m[dayKeyOf(t.date)] = t.score })
    return m
  }, [trend])
  const selectedQuestion = activeQuestions.find((q) => q.id === questionId)
  const overview = useMemo(
    () => (deepOpen
      ? buildOverviewTrend(overviewKeys, { transactions, leads, sessions, answers, scoreByDay, questionId: questionId || null }, { window: OV_WINDOW, questionLabel: selectedQuestion ? questionText(selectedQuestion, gender) : undefined })
      : null),
    [deepOpen, overviewKeys, transactions, leads, sessions, answers, scoreByDay, questionId, selectedQuestion, gender],
  )

  /* The correlation engine can take seconds when a coach's metrics really do
     move together (web measured 1.2–6.8s on a desktop) — on a phone's JS thread
     that freezes the screen. It never runs while the section is folded, and
     once opened it waits until the screen has painted and settled. */
  const [correlations, setCorrelations] = useState(null)
  useEffect(() => {
    setCorrelations(null)
    if (!deepOpen) return undefined
    let cancelled = false
    let timer = null
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (cancelled) return
        const found = buildOverviewCorrelations({ transactions, leads, sessions, answers }, { questions: activeQuestions, window: CORR_WINDOW })
        if (!cancelled) setCorrelations(found)
      }, 0)
    })
    return () => { cancelled = true; clearTimeout(timer); task?.cancel?.() }
  }, [deepOpen, transactions, leads, sessions, answers, activeQuestions])

  const conf = overall?.confidence ?? 0
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRC
  const pct = (v) => (v == null ? '—' : `${v}%`)

  /* x stays keyed to the day's place in the whole window, so a line that only
     starts on day 18 visibly starts there; unscored days are left out, not
     drawn at zero. The fill closes under the real points only. */
  const chart = useMemo(() => {
    const W = 300, H = 84, pad = 5
    if (trend.length < 2) return null
    const pts = trend
      .map((d, i) => (d.score == null ? null : [
        Math.round((pad + (i / (trend.length - 1)) * (W - 2 * pad)) * 10) / 10,
        Math.round((H - pad - (d.score / 100) * (H - 2 * pad)) * 10) / 10,
      ]))
      .filter(Boolean)
    if (pts.length < 2) return null
    const line = pts.map((pt) => pt.join(',')).join(' ')
    return { W, H, area: `${pts[0][0]},${H - pad} ${line} ${pts[pts.length - 1][0]},${H - pad}`, d: 'M' + pts.map((pt) => pt.join(',')).join(' L') }
  }, [trend])

  return (
    <Screen name="moon">
      <AddGoalEntryModal open={!!entryTarget} onClose={() => setEntryTarget(null)} category={entryTarget?.cat} goal={entryTarget?.goal} onSave={addEntry} />
      {loading && !overall ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error && !overall ? (
        /* A failed read leaves every list empty, and "you have no goals yet" is
           then a false statement about the coach's practice — the message they
           used to get. Say what happened and offer the way out (web
           moon-glance); only a settled read earns the empty state below. */
        <View style={styles.center}>
          <Text style={styles.empty}>{i18n.t('moon:loadError')}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => refetch()}><Text style={styles.emptyBtnText}>{i18n.t('moon:retry')}</Text></Pressable>
        </View>
      ) : !overall ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{i18n.t('moon:empty.noGoals', { action: i18n.t('moon:empty.action', { defaultValue: 'הגדר/י' }), defaultValue: 'עדיין אין יעדים.' })}</Text>
          <Pressable style={styles.emptyBtn} onPress={() => nav.navigate('Goals')}><Text style={styles.emptyBtnText}>{i18n.t('moon:empty.setGoal', { defaultValue: i18n.t('goals:newGoal') })}</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, bottomPad]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead title={i18n.t('moon:title', { defaultValue: 'מבט על' })} />
          <Pressable style={styles.headLink} onPress={() => nav.navigate('Reports')} accessibilityRole="link">
            <BarChart3 size={15} strokeWidth={1.6} color={colors.brand} />
            <Text style={styles.headLinkText}>{i18n.t('moon:reports')}</Text>
          </Pressable>
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
            {/* What "pace" means — the widget explains it; the screen built around
                that number did not. */}
            <View style={styles.ringInfo}>
              <Text style={styles.ringSub}>{i18n.t('moon:ring.sub', { pct: overall.pure, defaultValue: `${overall.pure}% מהיעד` })}</Text>
              <InfoPopover label={i18n.t('moon:ring.infoLabel')} text={i18n.t('moon:ring.infoText')} />
            </View>
            <Text style={styles.reflection}>{moonReflection(conf, gender)}</Text>
          </Card>

          {/* By category, then its goals by name */}
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
                    {/* The aggregate earns a row only when it aggregates more than one goal. */}
                    {(c.goals || []).length > 1 ? (
                      <>
                        <DualBar label={i18n.t('moon:dualBars.pace', { defaultValue: 'מהקצב' })} pct={c.confidence} color={colors.positive} />
                        <DualBar label={i18n.t('moon:dualBars.goal', { defaultValue: 'מהיעד' })} pct={c.pure} color={colors.moonDeep} />
                      </>
                    ) : null}
                    {(c.goals || []).map((g) => (
                      <View key={g.goal.id} style={styles.goalRow}>
                        <View style={styles.goalHead}>
                          <Text style={styles.goalName} numberOfLines={1}>{g.goal.label || c.category.name}</Text>
                          {c.category.measurement_type === 'manual' ? (
                            <Pressable
                              style={styles.goalAdd}
                              onPress={() => setEntryTarget({ goal: g.goal, cat: c.category })}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={i18n.t('moon:logEntryAria', { name: g.goal.label || c.category.name })}
                            >
                              <Plus size={14} strokeWidth={2} color={colors.brand} />
                            </Pressable>
                          ) : null}
                        </View>
                        <DualBar label={i18n.t('moon:dualBars.pace', { defaultValue: 'מהקצב' })} pct={Math.min(100, g.paced ?? 0)} color={colors.positive} />
                        <DualBar label={i18n.t('moon:dualBars.goal', { defaultValue: 'מהיעד' })} pct={g.pure} color={colors.moonDeep} />
                      </View>
                    ))}
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {/* Trend */}
          <View style={styles.section}>
            <Text style={styles.sectionH}>{i18n.t('moon:section.trend', { defaultValue: 'המגמה לאורך זמן' })}</Text>
            <Card contentStyle={styles.trendCard}>
              {chart ? (
                <>
                  <Svg viewBox={`0 0 ${chart.W} ${chart.H}`} width="100%" height={chart.H} accessibilityLabel={i18n.t('moon:trend.aria')}>
                    <Polygon points={chart.area} fill={colors.moon} fillOpacity={0.14} />
                    <Path d={chart.d} stroke={colors.moonDeep} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  </Svg>
                  <View style={styles.axis}>
                    <Text style={styles.axisText}>{shortDay(trend[0].date)}</Text>
                    <Text style={styles.axisText}>{shortDay(trend[trend.length - 1].date)}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.ovEmpty}>{i18n.t('moon:trend.tooShort')}</Text>
              )}
              <View style={styles.trendStats}>
                <TrendStat value={pct(stats.avg)} label={i18n.t('moon:trend.avg', { defaultValue: 'ממוצע' })} />
                <TrendStat value={pct(stats.peak)} label={i18n.t('moon:trend.peak', { defaultValue: 'שיא' })} divided />
                <TrendStat value={pct(stats.today)} label={i18n.t('moon:trend.today', { defaultValue: 'היום' })} />
              </View>
            </Card>
          </View>

          {/* The two statistical sections, folded behind one lid until asked for. */}
          <Pressable style={styles.deeperHead} onPress={() => setDeepOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: deepOpen }}>
            <View style={styles.deeperText}>
              <Text style={styles.deeperTitle}>{i18n.t('moon:deeper.title')}</Text>
              <Text style={styles.deeperSum} numberOfLines={1}>{i18n.t('moon:section.crossModule')} · {i18n.t('moon:section.correlations')}</Text>
            </View>
            {deepOpen ? <ChevronUp size={16} strokeWidth={1.8} color={colors.textSub} /> : <ChevronDown size={16} strokeWidth={1.8} color={colors.textSub} />}
          </Pressable>

          {deepOpen ? (
            <>
              {/* Cross-module trend overlay (§8.1) — self-normalized lines per metric */}
              <View style={styles.section}>
                <Text style={styles.sectionH}>{i18n.t('moon:section.crossModule', { defaultValue: 'מגמות בין מודולים' })}</Text>
                <View style={styles.ovPills}>
                  {OVERVIEW_PILLS.map((m) => {
                    const on = overviewKeys.includes(m.key)
                    const disabled = m.key === 'question' && activeQuestions.length === 0
                    return (
                      <Pressable key={m.key} disabled={disabled} style={[styles.ovPill, on && styles.ovPillOn, disabled && styles.ovPillOff]} onPress={() => toggleOverviewKey(m.key)} accessibilityState={{ selected: on, disabled }}>
                        <View style={[styles.ovDot, { backgroundColor: OVERVIEW_METRICS[m.key].color }]} />
                        <Text style={[styles.ovPillText, on && styles.ovPillTextOn]}>{i18n.t(m.labelKey)}</Text>
                      </Pressable>
                    )
                  })}
                </View>
                {activeQuestions.length === 0 ? <Text style={styles.corrNote}>{i18n.t('moon:overview.noQuestions')}</Text> : null}
                {overviewKeys.includes('question') && activeQuestions.length > 0 ? (
                  <Select label={i18n.t('moon:overview.pickQuestion')} value={questionId} onChange={(id) => update({ moonOverviewQuestion: id })} options={activeQuestions.map((q) => ({ value: q.id, label: questionText(q, gender) }))} />
                ) : null}
                <Card contentStyle={styles.ovCard}>
                  {overviewKeys.length === 0 ? (
                    <Text style={styles.ovEmpty}>{i18n.t('moon:overview.noneSelected')}</Text>
                  ) : (
                    <>
                      <MultiTrendChart days={overview?.days} series={overview?.series} />
                      {(overview?.days?.length || 0) > 1 ? (
                        <View style={styles.axis}>
                          <Text style={styles.axisText}>{shortDay(overview.days[0])}</Text>
                          <Text style={styles.axisText}>{shortDay(overview.days[overview.days.length - 1])}</Text>
                        </View>
                      ) : null}
                    </>
                  )}
                </Card>
                <Text style={styles.corrNote}>{i18n.t('moon:overview.note')}</Text>
              </View>

              {/* Guarded correlations (§8.2) — "patterns to explore", never headlines */}
              <View style={styles.section}>
                <Text style={styles.sectionH}>{i18n.t('moon:section.correlations', { defaultValue: 'קשרים לבדיקה' })}</Text>
                {correlations === null ? (
                  <Card contentStyle={styles.corrEmptyCard}>
                    <Text style={styles.corrEmpty}>{i18n.t('moon:corr.computing')}</Text>
                  </Card>
                ) : correlations.length === 0 ? (
                  <Card contentStyle={styles.corrEmptyCard}>
                    <Text style={styles.corrEmpty}>{i18n.t('moon:corr.empty')}</Text>
                  </Card>
                ) : (
                  <>
                    {correlations.map((c) => <CorrCard key={c.key} c={c} gender={gender} />)}
                    <Text style={styles.corrNote}>{i18n.t('moon:corr.note')}</Text>
                  </>
                )}
              </View>
            </>
          ) : null}

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
function CorrCard({ c, gender }) {
  const driver = questionText(c.driverLabel, gender)
  // The metric and the strength are ids; the card showed them raw ("קשר medium",
  // "…ו-income"). Translated as web does.
  const outcome = c.outcomeLabel ? i18n.t(`moon:pills.${c.outcomeLabel}`) : (c.outcomeQ ? questionText(c.outcomeQ, gender) : '')
  const raw = i18n.t(c.direction === 'pos' ? 'moon:corr.moveTogether' : 'moon:corr.moveOpposite', { driver, outcome })
  return (
    <Card contentStyle={styles.corrCard}>
      <View style={styles.corrText}>
        <Text style={styles.corrLine}>{taggedLine(raw)}</Text>
        <Text style={styles.corrSub}>{i18n.t('moon:corr.sub', { strength: i18n.t(`moon:corr.strength.${c.strength}`), n: c.n })}</Text>
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

const styles = themed((c, t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  content: { paddingHorizontal: 20, gap: 16 },
  error: { color: c.danger, fontSize: 13 },
  empty: { color: c.textFaint, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.brand },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: c.onBrand },

  hero: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  ringWrap: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { ...StyleSheet.absoluteFillObject, transform: [{ rotate: '-90deg' }] },
  ringNum: { fontSize: 28, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
  ringKicker: { fontSize: 11, color: c.textSub, marginTop: 1 },
  ringSub: { fontSize: 12, color: c.textSub },
  ringInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headLink: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: -8 },
  headLinkText: { fontSize: 13, fontWeight: '500', color: c.brand },
  goalRow: { gap: 6, paddingTop: 8 },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalName: { flex: 1, fontSize: 13, color: c.text },
  goalAdd: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  axisText: { fontSize: 10, color: c.textFaint, fontVariant: ['tabular-nums'] },
  deeperHead: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  deeperText: { flex: 1, gap: 2 },
  deeperTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  deeperSum: { fontSize: 11, color: c.textSub },
  reflection: { fontSize: 13, color: c.text, textAlign: 'center', lineHeight: 19, marginTop: 4, paddingHorizontal: 6 },

  section: { gap: 8 },
  sectionH: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: c.textSub, letterSpacing: 0.6, backgroundColor: c.fillStrong, paddingVertical: 3, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  catCard: { paddingVertical: 4, paddingHorizontal: 16 },
  cat: { paddingVertical: 12, gap: 8 },
  catBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  catName: { flex: 1, fontSize: 14, fontWeight: '500', color: c.text },
  dualRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dualLabel: { fontSize: 11, color: c.textSub, width: 42 },
  dualTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: c.fillStrong, overflow: 'hidden' },
  dualFill: { height: 7, borderRadius: 4 },
  dualPct: { fontSize: 11, color: c.textSub, width: 34, textAlign: 'right' },

  trendCard: { paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
  trendStats: { flexDirection: 'row' },
  trendStat: { flex: 1, alignItems: 'center', gap: 3 },
  trendStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.divider },
  trendStatV: { fontSize: 18, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
  trendStatL: { fontSize: 10, color: c.textSub, textTransform: 'uppercase', letterSpacing: 0.3 },

  footerLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'center', paddingVertical: 8 },
  footerLinkText: { fontSize: 13, color: c.brand, fontWeight: '500' },

  corrEmptyCard: { paddingVertical: 16, paddingHorizontal: 18 },
  corrEmpty: { fontSize: 13, color: c.textSub, lineHeight: 19 },
  corrCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  corrText: { flex: 1, gap: 4 },
  corrLine: { fontSize: 13, color: c.text, lineHeight: 19 },
  corrBold: { fontWeight: '700', color: c.text },
  corrSub: { fontSize: 11, color: c.textFaint },
  corrNote: { fontSize: 11, color: c.textFaint, lineHeight: 16, paddingHorizontal: 4 },

  ovPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ovPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  ovPillOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  ovPillOff: { opacity: 0.4 },
  ovDot: { width: 8, height: 8, borderRadius: 4 },
  ovPillText: { fontSize: 12, color: c.textSub },
  ovPillTextOn: { color: c.text, fontWeight: '600' },
  ovCard: { paddingVertical: 14, paddingHorizontal: 12, gap: 10 },
  ovEmpty: { fontSize: 12, color: c.textFaint, textAlign: 'center', paddingVertical: 20 },
  mtWrap: { gap: 10 },
  mtLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mtLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mtLegendDot: { width: 8, height: 8, borderRadius: 4 },
  mtLegendLabel: { fontSize: 11, color: c.textSub, maxWidth: 90 },
  mtLegendVal: { fontSize: 11, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
}))

DualBar.displayName = 'DualBar'
TrendStat.displayName = 'TrendStat'
Scatter.displayName = 'Scatter'
CorrCard.displayName = 'CorrCard'
MultiTrendChart.displayName = 'MultiTrendChart'
