import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Slider from '@react-native-community/slider'
import { Sparkles, Check } from 'lucide-react-native'
import { questionText, isQuestionDueToday } from '@simplicity/core'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import { colors } from '../../theme/theme'

// Daily-question widget (mirrors web InsightsWidget): the next unanswered active
// question due today + a live control — a 1–10 slider (10 = best) or yes/no —
// that persists via addAnswer and advances to the next question. Hidden when
// the user has no active questions (no mobile Settings screen to add one yet).
const dayStr = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function InsightsWidget({ questions, answers, addAnswer }) {
  const [val, setVal] = useState(null)
  const [busy, setBusy] = useState(false)

  const today = dayStr(0)
  const todayDate = useMemo(() => new Date(), [])
  const activeQuestions = useMemo(
    () => (questions || []).filter((x) => x.active && isQuestionDueToday(x, todayDate)),
    [questions, todayDate],
  )
  const q = useMemo(
    () => activeQuestions.find((x) => !(answers || []).some((a) => a.user_question_id === x.id && a.date === today)),
    [activeQuestions, answers, today],
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

  if (!activeQuestions.length) return null
  if (!q) {
    return (
      <View style={styles.wrap}>
        <Card contentStyle={styles.inner}>
          <Text style={styles.empty}>{i18n.t('home:widgets.insights.done')}</Text>
        </Card>
      </View>
    )
  }

  const text = questionText(q)
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
        <View style={styles.qRow}>
          <Sparkles size={16} strokeWidth={1.6} color={colors.brand} />
          <Text style={styles.q}>{text}</Text>
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
              maximumTrackTintColor="rgba(42,37,32,0.12)"
              thumbTintColor={colors.moonDeep}
              onValueChange={(v) => setVal(Math.round(v))}
            />
            <View style={styles.saveCol}>
              <Text style={styles.val}>{val ?? '—'}</Text>
              <Pressable
                style={[styles.saveBtn, (busy || val == null) && styles.saveBtnOff]}
                onPress={() => save(val)}
                disabled={busy || val == null}
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

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  inner: { paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  q: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 21 },
  empty: { fontSize: 14, color: colors.textSub, textAlign: 'center' },
  ynRow: { flexDirection: 'row', gap: 10 },
  ynBtn: { flex: 1, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  ynText: { fontSize: 15, fontWeight: '500', color: colors.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slider: { flex: 1, height: 36 },
  saveCol: { alignItems: 'center', gap: 2, width: 40 },
  val: { fontSize: 14, fontWeight: '600', color: colors.moonDeep, fontVariant: ['tabular-nums'] },
  saveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  saveBtnOff: { opacity: 0.4 },
  compare: { fontSize: 12, color: colors.textSub, textAlign: 'center', marginTop: -4 },
})
