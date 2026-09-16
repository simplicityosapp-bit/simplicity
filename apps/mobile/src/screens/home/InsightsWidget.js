import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import { useNavigation } from '@react-navigation/native'
import Slider from '@react-native-community/slider'
import { Sparkles, Check, SkipForward, Bell, ChevronUp, ChevronDown } from 'lucide-react-native'
import { questionText, isQuestionDueToday, skippedQuestionIds, isQuestionReminderDue } from '@simplicity/core'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import InfoPopover from '../../components/InfoPopover'
import { usePreferences } from '../../hooks/usePreferences'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

// Daily-question widget (mirrors web InsightsWidget): the next unanswered active
// question due today + a live control — a 1–10 slider (10 = best) or yes/no —
// that persists via addAnswer and advances to the next question. As on web: a
// question can be skipped for today (prefs.insSkipped — no answer written, so
// averages and streaks are untouched), the daily reminder nudges once its time
// has passed, the card folds away, and with no active question it invites one.
const dayStr = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function InsightsWidget({ questions, answers, addAnswer }) {
  const nav = useNavigation()
  const { prefs, update } = usePreferences()
  const gender = prefs?.design?.gender
  const [val, setVal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const today = dayStr(0)
  const todayDate = useMemo(() => new Date(), [])
  const activeQuestions = useMemo(
    () => (questions || []).filter((x) => x.active && isQuestionDueToday(x, todayDate)),
    [questions, todayDate],
  )
  const skippedToday = useMemo(() => skippedQuestionIds(prefs?.insSkipped, today), [prefs?.insSkipped, today])
  const q = useMemo(
    () => activeQuestions.find((x) => !skippedToday.includes(x.id) && !(answers || []).some((a) => a.user_question_id === x.id && a.date === today)),
    [activeQuestions, answers, today, skippedToday],
  )
  const overdue = !!q && isQuestionReminderDue(prefs?.insightsReminder)

  const skip = () => {
    if (busy || !q) return
    Promise.resolve(update((cur) => ({ insSkipped: { date: today, ids: [...skippedQuestionIds(cur?.insSkipped, today), q.id] } }))).catch(() => {})
    setVal(null)
  }
  const collapseBtn = (
    <Pressable
      onPress={() => setCollapsed((v) => !v)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={collapsed ? i18n.t('home:widgets.insights.expand') : i18n.t('home:widgets.insights.collapse')}
    >
      {collapsed ? <ChevronDown size={16} strokeWidth={1.7} color={colors.textSub} /> : <ChevronUp size={16} strokeWidth={1.7} color={colors.textSub} />}
    </Pressable>
  )

  const save = async (value) => {
    if (busy || !q) return
    setBusy(true)
    try {
      await addAnswer({ user_question_id: q.id, date: today, value_num: value, value_text: null, note: null })
      setVal(null)
    } catch {
      /* leave value so the user can retry */
    } finally {
      setBusy(false)
    }
  }

  if (collapsed) {
    return (
      <View style={styles.wrap}>
        <Card contentStyle={[styles.inner, styles.innerCollapsed]}>
          <Sparkles size={16} strokeWidth={1.6} color={colors.brand} />
          <View style={{ flex: 1 }} />
          {collapseBtn}
        </Card>
      </View>
    )
  }
  /* No question to ask at all — say where they come from rather than vanish. */
  if (!activeQuestions.length) {
    return (
      <View style={styles.wrap}>
        <Card contentStyle={styles.inner}>
          <View style={styles.qRow}>
            <Sparkles size={16} strokeWidth={1.6} color={colors.brand} />
            <Text style={styles.q}>{i18n.t('home:widgets.insights.prompt')}</Text>
            {collapseBtn}
          </View>
          <Pressable style={styles.addLink} onPress={() => nav.navigate('Insights')} accessibilityRole="button">
            <Text style={styles.addLinkText}>{i18n.t('home:widgets.insights.addQuestion')}</Text>
          </Pressable>
        </Card>
      </View>
    )
  }
  if (!q) {
    return (
      <View style={styles.wrap}>
        <Card contentStyle={styles.inner}>
          <View style={styles.qRow}>
            <Text style={[styles.empty, { flex: 1 }]}>{i18n.t('home:widgets.insights.done')}</Text>
            {collapseBtn}
          </View>
        </Card>
      </View>
    )
  }

  const text = questionText(q, gender)
  const yAns = (answers || []).find((a) => a.user_question_id === q.id && a.date === dayStr(-1))
  const yVal = yAns && typeof yAns.value_num === 'number' ? Number(yAns.value_num) : null
  let compare = ''
  if (val != null && yVal != null && q.scale_type !== 'yes_no') {
    compare = val > yVal ? i18n.t('home:widgets.insights.improved')
      : val === yVal ? i18n.t('home:widgets.insights.stable')
        : i18n.t('home:widgets.insights.lower')
  }
  const isYesNo = q.scale_type === 'yes_no'

  return (
    <View style={styles.wrap}>
      <Card contentStyle={styles.inner}>
        <View style={styles.topRow}>
          {overdue ? (
            <View style={styles.reminder}>
              <Bell size={12} strokeWidth={1.8} color={colors.amberWarn} />
              <Text style={styles.reminderText}>{i18n.t('home:widgets.insights.reminder')}</Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          <Pressable style={styles.skip} onPress={skip} disabled={busy} hitSlop={6} accessibilityRole="button" accessibilityLabel={i18n.t('home:widgets.insights.skipAria')}>
            <SkipForward size={13} strokeWidth={1.7} color={colors.textSub} />
            <Text style={styles.skipText}>{i18n.t('home:widgets.insights.skip')}</Text>
          </Pressable>
          {collapseBtn}
        </View>
        <View style={styles.qRow}>
          <Pressable style={styles.qPress} onPress={() => nav.navigate('Insights')} accessibilityRole="button">
            <Sparkles size={16} strokeWidth={1.6} color={colors.brand} />
            <Text style={styles.q}>{text}</Text>
          </Pressable>
          <InfoPopover label={i18n.t('home:widgets.insights.infoLabel')} text={i18n.t('home:widgets.insights.infoText')} />
        </View>

        {isYesNo ? (
          <View style={styles.ynRow}>
            <Pressable style={styles.ynBtn} onPress={() => save(1)} disabled={busy}>
              <Text style={styles.ynText}>{i18n.t('home:widgets.insights.yes')}</Text>
            </Pressable>
            <Pressable style={styles.ynBtn} onPress={() => save(0)} disabled={busy}>
              <Text style={styles.ynText}>{i18n.t('home:widgets.insights.no')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={10}
              step={1}
              value={val ?? 5}
              minimumTrackTintColor={colors.moonDeep}
              maximumTrackTintColor={colors.fillStrong}
              thumbTintColor={colors.moonDeep}
              onValueChange={(v) => setVal(Math.round(v))}
            />
            <View style={styles.saveCol}>
              {/* The slider rests on 5 before it is touched, so 5 is the answer
                  on offer: show it and let it be saved. The save used to stay
                  disabled until the slider moved, and "5" could only be
                  answered by dragging away and back (web InsightsWidget). */}
              <Text style={styles.val}>{val ?? 5}</Text>
              <Pressable
                style={[styles.saveBtn, busy && styles.saveBtnOff]}
                onPress={() => save(val ?? 5)}
                disabled={busy}
                accessibilityLabel={i18n.t('home:widgets.insights.saveAria')}
              >
                <Check size={15} strokeWidth={2} color={colors.onBrand} />
              </Pressable>
            </View>
          </View>
        )}

        {compare ? <Text style={styles.compare}>{compare}</Text> : null}
      </Card>
    </View>
  )
}

const styles = themed((c, t) => ({
  wrap: { marginTop: 12 },
  inner: { paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qPress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  innerCollapsed: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: -4 },
  reminder: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  reminderText: { flexShrink: 1, fontSize: 12, color: c.amberWarn },
  skip: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4 },
  skipText: { fontSize: 12, color: c.textSub },
  addLink: { minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' },
  addLinkText: { fontSize: 14, fontWeight: '600', color: c.brand },
  q: { flex: 1, fontSize: 15, color: c.text, lineHeight: 21 },
  empty: { fontSize: 14, color: c.textSub, textAlign: 'center' },
  ynRow: { flexDirection: 'row', gap: 10 },
  ynBtn: { flex: 1, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center' },
  ynText: { fontSize: 15, fontWeight: '500', color: c.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slider: { flex: 1, height: 36 },
  saveCol: { alignItems: 'center', gap: 2, width: 40 },
  val: { fontSize: 14, fontWeight: '600', color: c.moonDeep, fontVariant: ['tabular-nums'] },
  saveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  saveBtnOff: { opacity: 0.4 },
  compare: { fontSize: 12, color: c.textSub, textAlign: 'center', marginTop: -4 },
}))
