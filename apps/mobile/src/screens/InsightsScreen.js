import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import Svg, { Polyline, Circle, Rect } from 'react-native-svg'
import Slider from '@react-native-community/slider'
import { Sparkles, Check, Trash2 } from 'lucide-react-native'
import {
  questionText, ymdKey, indexAnswers, getAnswer, averageForWindow, deltaVsPrevWindow,
  trendPoints, heatmapWeeks, mirrorReflections,
} from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { usePreferences } from '../lib/preferences'
import { useInsightsData } from '../hooks/useInsightsData'

// Insights ("מה איתך היום") — mirrors web InsightsScreen: mirror reflections +
// a card per active question with a daily-answer control, 7/30-day averages, a
// 30-day trend line and a 26-week heatmap (all from the shared insights engine).
const T = (k, o) => i18n.t(`insights:${k}`, o)

function TrendLine({ points }) {
  const W = 240, H = 44, pad = 4
  const numeric = points.filter((p) => p.value != null)
  if (numeric.length < 2) return <Text style={styles.vizEmpty}>{T('trend.notEnough', { defaultValue: 'עוד אין מספיק נתונים' })}</Text>
  const min = Math.min(...numeric.map((p) => p.value))
  const max = Math.max(...numeric.map((p) => p.value))
  const range = max - min || 1
  const xs = (i) => pad + (i / (points.length - 1)) * (W - 2 * pad)
  const ys = (v) => H - pad - ((v - min) / range) * (H - 2 * pad)
  const segments = []
  let curr = []
  points.forEach((p, i) => {
    if (p.value == null) { if (curr.length) { segments.push(curr); curr = [] } } else curr.push(`${xs(i)},${ys(p.value)}`)
  })
  if (curr.length) segments.push(curr)
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {segments.map((seg, i) => <Polyline key={i} points={seg.join(' ')} fill="none" stroke={colors.positive} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />)}
      {points.map((p, i) => (p.value == null ? null : <Circle key={i} cx={xs(i)} cy={ys(p.value)} r={1.6} fill={colors.positive} />))}
    </Svg>
  )
}

function Heatmap({ weeks }) {
  const CELL = 8, GAP = 2
  const vals = weeks.flat().filter((c) => c && c.value != null).map((c) => c.value)
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const range = max - min || 1
  const W = weeks.length * (CELL + GAP)
  const H = 7 * (CELL + GAP)
  const fill = (v) => {
    if (v == null) return 'rgba(42,37,32,0.06)'
    const o = 0.2 + 0.8 * ((v - min) / range)
    return `rgba(139,168,136,${o.toFixed(2)})`
  }
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {weeks.map((col, w) => col.map((cell, r) => (
        <Rect key={`${w}-${r}`} x={w * (CELL + GAP)} y={r * (CELL + GAP)} width={CELL} height={CELL} rx={2} fill={cell ? fill(cell.value) : 'transparent'} />
      )))}
    </Svg>
  )
}

function QuestionInsightCard({ question, idx, today, gender, onSubmit, onToggle, onDelete }) {
  const [draft, setDraft] = useState(5)
  const [busy, setBusy] = useState(false)
  const answered = getAnswer(idx, question.id, today)
  const answeredVal = answered?.value_num
  const avg7 = useMemo(() => averageForWindow(idx, question.id, 7), [idx, question.id])
  const avg30 = useMemo(() => averageForWindow(idx, question.id, 30), [idx, question.id])
  const d7 = useMemo(() => deltaVsPrevWindow(idx, question.id, 7), [idx, question.id])
  const points = useMemo(() => trendPoints(idx, question.id, 30), [idx, question.id])
  const heat = useMemo(() => heatmapWeeks(idx, question.id, new Date(), 26), [idx, question.id])
  const isYn = question.scale_type === 'yes_no'
  const submit = async (v) => { if (busy) return; setBusy(true); try { await onSubmit(question.id, v) } finally { setBusy(false) } }

  return (
    <Card contentStyle={[styles.qcard, !question.active && styles.qcardOff]}>
      <View style={styles.qhead}>
        <Text style={styles.qicon}>{question.icon || '🫧'}</Text>
        <Text style={styles.qtext}>{questionText(question, gender)}</Text>
        {answeredVal != null ? <Text style={styles.todayPill}>{answeredVal}</Text> : null}
        <Pressable onPress={() => onToggle(question)} hitSlop={6}>
          <View style={[styles.toggle, question.active && styles.toggleOn]}><View style={[styles.knob, question.active && styles.knobOn]} /></View>
        </Pressable>
      </View>

      {question.active && answeredVal == null ? (
        isYn ? (
          <View style={styles.yn}>
            <Pressable style={styles.ynBtn} disabled={busy} onPress={() => submit(1)}><Text style={styles.ynText}>{T('card.yes', { defaultValue: 'כן' })}</Text></Pressable>
            <Pressable style={styles.ynBtn} disabled={busy} onPress={() => submit(0)}><Text style={styles.ynText}>{T('card.no', { defaultValue: 'לא' })}</Text></Pressable>
          </View>
        ) : (
          <View style={styles.sliderRow}>
            <Slider style={{ flex: 1 }} minimumValue={1} maximumValue={10} step={1} value={draft} onValueChange={setDraft} minimumTrackTintColor={colors.moonDeep} maximumTrackTintColor={colors.border} thumbTintColor={colors.moonDeep} />
            <Text style={styles.sliderVal}>{draft}</Text>
            <Pressable style={styles.save} disabled={busy} onPress={() => submit(draft)}><Check size={15} strokeWidth={2} color={colors.positive} /></Pressable>
          </View>
        )
      ) : null}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statL}>{T('card.avg7', { defaultValue: 'ממוצע 7 ימים' })}</Text>
          <View style={styles.statVrow}>
            <Text style={styles.statV}>{avg7 != null ? avg7.toFixed(1) : '—'}</Text>
            {d7 != null && d7 !== 0 ? <Text style={[styles.delta, d7 > 0 ? styles.deltaUp : styles.deltaDown]}>{d7 > 0 ? '▲' : '▼'}{Math.abs(d7).toFixed(1)}</Text> : null}
          </View>
        </View>
        <View style={[styles.stat, styles.statDivided]}>
          <Text style={styles.statL}>{T('card.avg30', { defaultValue: 'ממוצע 30 יום' })}</Text>
          <Text style={styles.statV}>{avg30 != null ? avg30.toFixed(1) : '—'}</Text>
        </View>
      </View>

      <View style={styles.viz}><TrendLine points={points} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><Heatmap weeks={heat} /></ScrollView>

      <Pressable style={styles.del} onPress={() => onDelete(question.id)} hitSlop={6}>
        <Trash2 size={13} strokeWidth={1.7} color={colors.textFaint} />
        <Text style={styles.delText}>{T('delete.confirm', { defaultValue: 'מחיקה' })}</Text>
      </Pressable>
    </Card>
  )
}
QuestionInsightCard.displayName = 'QuestionInsightCard'
TrendLine.displayName = 'TrendLine'
Heatmap.displayName = 'Heatmap'

export default function InsightsScreen() {
  const { questions, answers, loading, error, refetch, addAnswer, toggleActive, removeQuestion } = useInsightsData()
  const { prefs } = usePreferences()
  const gender = prefs.design?.gender
  const today = ymdKey(new Date())
  const idx = useMemo(() => indexAnswers(answers), [answers])
  const mirror = useMemo(() => mirrorReflections(questions, idx, new Date(), gender), [questions, idx, gender])
  const submit = (qid, value_num) => addAnswer({ user_question_id: qid, date: today, value_num })

  return (
    <Screen name="moon">
      <ScreenHead
        title={T('title', { defaultValue: 'מה איתך היום' })}
        meta={questions.length ? [T('activeCount', { count: questions.filter((q) => q.active).length, defaultValue: `${questions.filter((q) => q.active).length} שאלות` })] : []}
        tagline={T('tagline', { defaultValue: 'מראה יומית קטנה.' })}
      />

      {loading && !questions.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {mirror.length ? (
            <Card contentStyle={styles.mirror}>
              <Sparkles size={16} strokeWidth={1.7} color={colors.brand} />
              <View style={{ flex: 1, gap: 4 }}>
                {mirror.map((m, i) => <Text key={i} style={styles.mirrorText}>{m.text}</Text>)}
              </View>
            </Card>
          ) : null}

          {questions.length ? (
            questions.map((q) => (
              <QuestionInsightCard key={q.id} question={q} idx={idx} today={today} gender={gender} onSubmit={submit} onToggle={toggleActive} onDelete={removeQuestion} />
            ))
          ) : (
            <Text style={styles.empty}>{T('empty', { defaultValue: 'אין עדיין שאלות יומיות.' })}</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 14 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },

  mirror: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16 },
  mirrorText: { fontSize: 13, color: colors.text, lineHeight: 19 },

  qcard: { padding: 16, gap: 12 },
  qcardOff: { opacity: 0.6 },
  qhead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qicon: { fontSize: 18 },
  qtext: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  todayPill: { fontSize: 12, fontWeight: '600', color: colors.positive, backgroundColor: 'rgba(139,168,136,0.15)', minWidth: 22, textAlign: 'center', borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7, overflow: 'hidden' },
  toggle: { width: 40, height: 24, borderRadius: 999, backgroundColor: colors.cardFlat, borderWidth: 1, borderColor: colors.border, padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.moonDeep, borderColor: colors.moonDeep },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.onBrand },
  knobOn: { alignSelf: 'flex-end' },

  yn: { flexDirection: 'row', gap: 10 },
  ynBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  ynText: { fontSize: 15, fontWeight: '600', color: colors.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderVal: { fontSize: 16, fontWeight: '700', color: colors.text, width: 24, textAlign: 'center' },
  save: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(139,168,136,0.18)', borderWidth: 1, borderColor: colors.positive, alignItems: 'center', justifyContent: 'center' },

  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  statL: { fontSize: 11, color: colors.textSub },
  statVrow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statV: { fontSize: 18, fontWeight: '600', color: colors.text },
  delta: { fontSize: 11, fontWeight: '700' },
  deltaUp: { color: colors.positive },
  deltaDown: { color: colors.danger },

  viz: { paddingVertical: 2 },
  vizEmpty: { fontSize: 12, color: colors.textFaint, paddingVertical: 14, textAlign: 'center' },

  del: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 },
  delText: { fontSize: 12, color: colors.textFaint },
})
