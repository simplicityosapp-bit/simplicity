import { useMemo, useState } from 'react'
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import Svg, { Polyline, Circle, Rect } from 'react-native-svg'
import Slider from '@react-native-community/slider'
import { Sparkles, Check, Trash2, Pencil, Target, RotateCcw, ChevronDown, ChevronUp, X, Bell } from 'lucide-react-native'
import {
  questionText, ymdKey, indexAnswers, getAnswer, averageForWindow, deltaVsPrevWindow,
  trendPoints, heatmapWeeks, mirrorReflections, isQuestionDueToday, describeSchedule,
  skippedQuestionIds, fmtShortDate,
} from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import ScreenCount from '../components/ScreenCount'
import Card from '../components/Card'
import AddQuestionModal from '../modals/AddQuestionModal'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'
import { usePreferences } from '../lib/preferences'
import { useInsightsData } from '../hooks/useInsightsData'
import { useBottomPad } from '../lib/bottomBar'

// Insights ("מה איתך היום") — mirrors web InsightsScreen: mirror reflections +
// a card per active question with a daily-answer control, 7/30-day averages, a
// 30-day trend line and a 26-week heatmap (all from the shared insights engine).
// Each card says when it is asked and whether a goal tracks it; a question
// skipped today (home widget) waits behind "answer N skipped"; the answer
// history lists the last 30 with removal; deletes ask first and can be undone;
// and the daily in-app reminder is set here (web keeps it under Settings ›
// Questions, which on the phone is this screen).
const CANCEL = () => i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/
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

function Heatmap({ weeks, scale }) {
  const CELL = 8, GAP = 2
  const vals = weeks.flat().filter((c) => c && c.value != null).map((c) => c.value)
  const min = vals.length ? Math.min(...vals) : 1
  const max = vals.length ? Math.max(...vals) : 10
  const range = max - min || 1
  const W = weeks.length * (CELL + GAP)
  const H = 7 * (CELL + GAP)
  const fill = (v) => {
    if (v == null) return colors.fill
    const o = scale === 'yes_no' ? (v >= 1 ? 0.85 : 0.2) : (0.18 + 0.72 * ((v - min) / range))
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

function QuestionInsightCard({ question, idx, today, gender, skipped, linkedToGoal, onSubmit, onToggle, onEdit, onDelete }) {
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
        <View style={styles.qtextCol}>
          <Text style={styles.qtext}>{questionText(question, gender)}</Text>
          <View style={styles.qmeta}>
            <Text style={styles.qmetaText}>{describeSchedule(question)}</Text>
            {linkedToGoal ? (
              <View style={styles.qgoal} accessibilityLabel={i18n.t('settings:questions.linkedToGoal')}>
                <Target size={11} strokeWidth={1.8} color={colors.brand} />
                <Text style={styles.qgoalText}>{i18n.t('settings:questions.linkedToGoal')}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {answeredVal != null ? <Text style={styles.todayPill}>{answeredVal}</Text> : null}
        {onEdit ? <Pressable accessibilityLabel={i18n.t('insights:card.editTitle')} onPress={() => onEdit(question)} hitSlop={6}><Pencil size={14} strokeWidth={1.7} color={colors.textFaint} /></Pressable> : null}
        <Pressable onPress={() => onToggle(question)} hitSlop={6}>
          <View style={[styles.toggle, question.active && styles.toggleOn]}><View style={[styles.knob, question.active && styles.knobOn]} /></View>
        </Pressable>
      </View>

      {question.active && isQuestionDueToday(question) && answeredVal == null && !skipped ? (
        isYn ? (
          <View style={styles.yn}>
            <Pressable style={styles.ynBtn} disabled={busy} onPress={() => submit(1)}><Text style={styles.ynText}>{T('card.yes', { defaultValue: 'כן' })}</Text></Pressable>
            <Pressable style={styles.ynBtn} disabled={busy} onPress={() => submit(0)}><Text style={styles.ynText}>{T('card.no', { defaultValue: 'לא' })}</Text></Pressable>
          </View>
        ) : (
          <View style={styles.sliderRow}>
            <Slider style={{ flex: 1 }} minimumValue={1} maximumValue={10} step={1} value={draft} onValueChange={setDraft} minimumTrackTintColor={colors.moonDeep} maximumTrackTintColor={colors.border} thumbTintColor={colors.moonDeep} />
            <Text style={styles.sliderVal}>{draft}</Text>
            <Pressable accessibilityLabel={i18n.t('common:save')} style={styles.save} disabled={busy} onPress={() => submit(draft)}><Check size={15} strokeWidth={2} color={colors.positive} /></Pressable>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><Heatmap weeks={heat} scale={question.scale_type} /></ScrollView>

      <Pressable style={styles.del} onPress={() => onDelete(question)} hitSlop={6} accessibilityLabel={T('card.deleteAria', { question: questionText(question, gender) })}>
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
  const bottomPad = useBottomPad()
  const { questions, answers, linkedQuestionIds, loading, error, refetch, addAnswer, addQuestion, toggleActive, removeQuestion, removeAnswer, updateQuestion } = useInsightsData()
  const { prefs, update: updatePrefs } = usePreferences()
  const gender = prefs.design?.gender
  const today = ymdKey(new Date())
  const idx = useMemo(() => indexAnswers(answers), [answers])
  const mirror = useMemo(() => mirrorReflections(questions, idx, new Date(), gender), [questions, idx, gender])
  const submit = (qid, value_num) => addAnswer({ user_question_id: qid, date: today, value_num })
  const [showAdd, setShowAdd] = useState(false)
  const [editQ, setEditQ] = useState(null)
  const nextOrder = questions.reduce((m, q) => Math.max(m, (q.order ?? 0) + 1), 0)
  const usedTemplateKeys = questions.map((q) => q.template_key).filter(Boolean)
  /* The figure the header chip used to carry — see components/ScreenCount. */
  const activeQuestionCount = questions.filter((q) => q.active).length

  /* Skipped today on the home widget (prefs.insSkipped): no answer written,
     just out of today's queue — hidden here too, with a way to bring them back. */
  const skippedSet = useMemo(() => new Set(skippedQuestionIds(prefs?.insSkipped, today)), [prefs?.insSkipped, today])
  const skippedCount = questions.filter((q) => skippedSet.has(q.id) && q.active && isQuestionDueToday(q) && getAnswer(idx, q.id, today)?.value_num == null).length
  const unskipAll = () => Promise.resolve(updatePrefs({ insSkipped: { date: today, ids: [] } })).catch(() => {})

  const confirmDeleteQuestion = (q) => Alert.alert(
    T('delete.title'),
    T('delete.message', { question: questionText(q, gender) }),
    [{ text: CANCEL(), style: 'cancel' }, { text: T('delete.confirm'), style: 'destructive', onPress: () => removeQuestion(q.id) }],
  )

  /* The last 30 answers, newest first; open/closed follows the user across devices. */
  const historyOpen = !!prefs?.insShowHistory
  const toggleHistory = () => Promise.resolve(updatePrefs({ insShowHistory: !historyOpen })).catch(() => {})
  const recent = useMemo(() => (answers || []).filter((a) => !a.deleted_at).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30), [answers])
  const questionById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  const answerValue = (a) => (a.value_num != null ? a.value_num : (a.value_text || '—'))
  const confirmDeleteAnswer = (a) => Alert.alert(
    T('history.deleteTitle'),
    T('history.deleteMessage', { value: answerValue(a), date: fmtShortDate(a.date) }),
    [{ text: CANCEL(), style: 'cancel' }, { text: T('history.deleteConfirm'), style: 'destructive', onPress: () => removeAnswer(a.id) }],
  )

  const reminder = prefs?.insightsReminder || {}
  const [timeDraft, setTimeDraft] = useState(null)
  const setReminder = (patch) => Promise.resolve(updatePrefs({ insightsReminder: { enabled: !!reminder.enabled, time: reminder.time || '20:00', ...patch } })).catch(() => {})
  const commitTime = () => {
    if (timeDraft != null && HHMM.test(timeDraft.trim())) {
      const [h, m] = timeDraft.trim().split(':')
      setReminder({ time: `${h.padStart(2, '0')}:${m}` })
    }
    setTimeDraft(null)
  }

  return (
    <Screen name="moon">
      <AddQuestionModal
        open={showAdd || !!editQ}
        onClose={() => { setShowAdd(false); setEditQ(null) }}
        onSave={editQ ? (patch) => updateQuestion(editQ.id, patch) : addQuestion}
        editQuestion={editQ}
        nextOrder={nextOrder}
        usedTemplateKeys={usedTemplateKeys}
      />
      {loading && !questions.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, bottomPad]} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          <ScreenHead
            title={T('title', { defaultValue: 'מה איתך היום' })}
            onAdd={() => setShowAdd(true)}
            addLabel={i18n.t('settings:questions.add', { defaultValue: 'הוספת שאלה' })}
          />
          <ScreenCount>{questions.length ? T('activeCount', { count: activeQuestionCount, defaultValue: `${activeQuestionCount} שאלות` }) : null}</ScreenCount>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {mirror.length ? (
            <Card contentStyle={styles.mirror}>
              <Sparkles size={16} strokeWidth={1.7} color={colors.brand} />
              <View style={{ flex: 1, gap: 4 }}>
                {mirror.map((m, i) => <Text key={i} style={[styles.mirrorText, (m.kind === 'welcome' || m.kind === 'stable') && styles.mirrorTextMuted]}>{m.text}</Text>)}
              </View>
            </Card>
          ) : null}

          {questions.length ? (
            questions.map((q) => (
              <QuestionInsightCard key={q.id} question={q} idx={idx} today={today} gender={gender} skipped={skippedSet.has(q.id)} linkedToGoal={linkedQuestionIds?.has(q.id)} onSubmit={submit} onToggle={toggleActive} onEdit={setEditQ} onDelete={confirmDeleteQuestion} />
            ))
          ) : (
            <Text style={styles.empty}>{T('empty', { defaultValue: 'אין עדיין שאלות יומיות.' })}</Text>
          )}

          {skippedCount > 0 ? (
            <Pressable style={styles.unskip} onPress={unskipAll} accessibilityRole="button">
              <RotateCcw size={14} strokeWidth={1.7} color={colors.brand} />
              <Text style={styles.unskipText}>{skippedCount === 1 ? T('unskip.one') : T('unskip.many', { count: skippedCount })}</Text>
            </Pressable>
          ) : null}

          <Card contentStyle={styles.hist}>
            <Pressable style={styles.histToggle} onPress={toggleHistory} accessibilityRole="button" accessibilityState={{ expanded: historyOpen }}>
              <Text style={styles.histTitle}>{T('history.title')}</Text>
              {historyOpen ? <ChevronUp size={15} strokeWidth={1.7} color={colors.textSub} /> : <ChevronDown size={15} strokeWidth={1.7} color={colors.textSub} />}
            </Pressable>
            {historyOpen ? (recent.length === 0 ? (
              <Text style={styles.vizEmpty}>{T('history.empty')}</Text>
            ) : recent.map((a) => {
              const q = questionById.get(a.user_question_id)
              return (
                <View key={a.id} style={styles.histRow}>
                  <Text style={styles.histIcon}>{q?.icon || '🫧'}</Text>
                  <Text style={styles.histText} numberOfLines={1}>{q ? questionText(q, gender) : T('history.deletedQuestion')}</Text>
                  <Text style={styles.histDate}>{fmtShortDate(a.date)}</Text>
                  <Text style={styles.histVal}>{answerValue(a)}</Text>
                  <Pressable onPress={() => confirmDeleteAnswer(a)} hitSlop={8} accessibilityLabel={T('history.deleteAria')}>
                    <X size={13} strokeWidth={1.8} color={colors.textSub} />
                  </Pressable>
                </View>
              )
            })) : null}
          </Card>

          <Card contentStyle={styles.remind}>
            <View style={styles.remindHead}>
              <Bell size={15} strokeWidth={1.7} color={colors.textSub} />
              <Text style={styles.histTitle}>{i18n.t('settings:questions.reminderTitle')}</Text>
            </View>
            <View style={styles.remindRow}>
              <Pressable style={[styles.toggle, reminder.enabled && styles.toggleOn]} onPress={() => setReminder({ enabled: !reminder.enabled })} accessibilityRole="switch" accessibilityState={{ checked: !!reminder.enabled }} accessibilityLabel={i18n.t('settings:questions.reminderToggle')} hitSlop={6}>
                <View style={[styles.knob, reminder.enabled && styles.knobOn]} />
              </Pressable>
              <Text style={styles.remindLabel}>{i18n.t('settings:questions.reminderLabel')}</Text>
              <TextInput
                style={[styles.remindTime, !reminder.enabled && styles.remindTimeOff]}
                value={timeDraft ?? (reminder.time || '20:00')}
                onChangeText={setTimeDraft}
                onBlur={commitTime}
                onSubmitEditing={commitTime}
                editable={!!reminder.enabled}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel={i18n.t('settings:questions.reminderLabel')}
              />
            </View>
            <Text style={styles.remindHint}>{i18n.t('settings:questions.reminderHint')}</Text>
          </Card>
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = themed((c, t) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 14 },
  error: { color: c.danger, fontSize: 13 },
  empty: { color: c.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },

  mirror: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16 },
  mirrorText: { fontSize: 13, color: c.text, lineHeight: 19 },
  mirrorTextMuted: { color: c.textSub },

  qcard: { padding: 16, gap: 12 },
  qcardOff: { opacity: 0.6 },
  qhead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qicon: { fontSize: 18 },
  qtextCol: { flex: 1, gap: 3 },
  qtext: { fontSize: 15, fontWeight: '600', color: c.text },
  qmeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  qmetaText: { fontSize: 11, color: c.textSub },
  qgoal: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  qgoalText: { fontSize: 11, color: c.brand },
  unskip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  unskipText: { fontSize: 13, fontWeight: '600', color: c.brand },
  hist: { paddingVertical: 6, paddingHorizontal: 16 },
  histToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  histTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  histRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
  histIcon: { fontSize: 15 },
  histText: { flex: 1, fontSize: 13, color: c.text },
  histDate: { fontSize: 12, color: c.textSub },
  histVal: { minWidth: 22, fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  remind: { padding: 16, gap: 10 },
  remindHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  remindLabel: { flex: 1, fontSize: 13, color: c.textSub },
  remindTime: { width: 70, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 8, fontSize: 15, color: c.text, backgroundColor: c.card, textAlign: 'center', fontVariant: ['tabular-nums'] },
  remindTimeOff: { opacity: 0.5 },
  remindHint: { fontSize: 12, color: c.textFaint, lineHeight: 17 },
  todayPill: { fontSize: 12, fontWeight: '600', color: c.positive, backgroundColor: 'rgba(139,168,136,0.15)', minWidth: 22, textAlign: 'center', borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7, overflow: 'hidden' },
  toggle: { width: 40, height: 24, borderRadius: 999, backgroundColor: c.cardFlat, borderWidth: 1, borderColor: c.border, padding: 2, justifyContent: 'center' },
  toggleOn: { backgroundColor: c.moonDeep, borderColor: c.moonDeep },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: c.onBrand },
  knobOn: { alignSelf: 'flex-end' },

  yn: { flexDirection: 'row', gap: 10 },
  ynBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center' },
  ynText: { fontSize: 15, fontWeight: '600', color: c.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderVal: { fontSize: 16, fontWeight: '700', color: c.text, width: 24, textAlign: 'center' },
  save: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(139,168,136,0.18)', borderWidth: 1, borderColor: c.positive, alignItems: 'center', justifyContent: 'center' },

  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.divider },
  statL: { fontSize: 11, color: c.textSub },
  statVrow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statV: { fontSize: 18, fontWeight: '600', color: c.text },
  delta: { fontSize: 11, fontWeight: '700' },
  deltaUp: { color: c.positive },
  deltaDown: { color: c.danger },

  viz: { paddingVertical: 2 },
  vizEmpty: { fontSize: 12, color: c.textFaint, paddingVertical: 14, textAlign: 'center' },

  del: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 },
  delText: { fontSize: 12, color: c.textFaint },
}))
