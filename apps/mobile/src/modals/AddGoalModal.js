import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { questionText, scheduledOccurrences } from '@simplicity/core'
import { useFormOptions } from '../lib/formOptions'
import { ALL_METRICS, metricName, OTHER_METRIC_KEY } from '../lib/goalPresets'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add a goal (mirrors web AddGoalModal: metric + name + time-frame + target +
// importance + project; for the manual "other" metric, a tracking choice —
// manual entries or linked to an existing daily question). Inline question
// AUTHORING (write a new question + schedule) is still deferred to the Questions
// screen. onSave resolves metric_key → category (useGoalsData.addGoal).
const IMPORTANCE = [1, 2, 3, 4, 5]
const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']
const SCALES = [{ k: '1-10', l: 'scaleRange' }, { k: 'yes_no', l: 'scaleYesNo' }]
const blank = () => ({ metric_key: '', label: '', time_frame: 'monthly', target_value: '', target_date: '', importance: 3, project_id: '', group_id: '', tracking_method: 'manual', tracked_by_question_id: '', question_mode: 'existing', question_text: '', question_scale: '1-10', question_icon: ICONS[0] })

export default function AddGoalModal({ open, onClose, onSave, onAddQuestion }) {
  const { projects, groups = [], userQuestions } = useFormOptions()
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const isManual = form.metric_key === OTHER_METRIC_KEY
  const byQuestion = isManual && form.tracking_method === 'daily_question'
  const activeQuestions = (userQuestions || []).filter((q) => q.active)
  // Pick an existing question or write a new one inline (mirrors web's qMode).
  // With no active questions we force "new"; with no onAddQuestion, "existing".
  const canCreateQuestion = !!onAddQuestion
  const hasActiveQ = activeQuestions.length > 0
  const qMode = byQuestion ? (hasActiveQ && canCreateQuestion ? form.question_mode : (canCreateQuestion ? 'new' : 'existing')) : null
  const creatingQuestion = byQuestion && qMode === 'new'

  // A yes/no goal can't target more "yes" answers than the question is asked
  // (its schedule caps it); sliders accumulate freely. Handles both a picked
  // question (its stored schedule) and a new one (every-day = {}). Mirrors web.
  const selectedQuestion = activeQuestions.find((q) => q.id === form.tracked_by_question_id)
  const effIsYesNo = byQuestion && (creatingQuestion ? form.question_scale === 'yes_no' : selectedQuestion?.scale_type === 'yes_no')
  const effPattern = creatingQuestion ? {} : selectedQuestion?.schedule_pattern
  const maxOccurrences = effIsYesNo ? scheduledOccurrences(effPattern, form.time_frame, form.target_date) : null
  const overMax = effIsYesNo && parseFloat(form.target_value) > maxOccurrences

  const TIME_FRAMES = [
    { k: 'monthly', l: i18n.t('modalsData:addGoal.tf.monthly') },
    { k: 'weekly', l: i18n.t('modalsData:addGoal.tf.weekly') },
    { k: 'deadline', l: i18n.t('modalsData:addGoal.tf.deadline') },
  ]

  const submit = async () => {
    if (!form.metric_key) { setErr(i18n.t('modalsData:addGoal.needMetric')); return }
    const target = parseFloat(form.target_value)
    if (!target || target <= 0) { setErr(i18n.t('modalsData:addGoal.needTarget')); return }
    if (form.time_frame === 'deadline' && !form.target_date) { setErr(i18n.t('modalsData:addGoal.needTargetDate')); return }
    if (byQuestion && creatingQuestion && !form.question_text.trim()) { setErr(i18n.t('modalsData:addGoal.needQuestionText')); return }
    if (byQuestion && !creatingQuestion && !form.tracked_by_question_id) { setErr(i18n.t('modalsData:addGoal.needQuestion')); return }
    if (overMax) { setErr(i18n.t('modalsData:addGoal.overMaxError', { max: maxOccurrences })); return }
    setBusy(true)
    setErr('')
    try {
      // Create the brand-new daily question first (every-day schedule, matching
      // mobile's AddQuestionModal convention), then link the goal to it.
      let questionId = form.tracked_by_question_id
      if (byQuestion && creatingQuestion) {
        const q = await onAddQuestion({
          template_key: null,
          custom_text: form.question_text.trim(),
          scale_type: form.question_scale,
          icon: form.question_icon,
          active: true,
          schedule_pattern: {},
        })
        questionId = q.id
      }
      await onSave({
        metric_key: form.metric_key,
        parent_goal_id: null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: byQuestion ? questionId : null,
        measurement_type: null,
        data_source: null,
        manual_input_type: null,
        schedule_pattern: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') }))
    }
  }

  const none = i18n.t('modalsData:common.none')

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsData:addGoal.title')}>
      <Select
        label={i18n.t('modalsData:addGoal.metric')}
        value={form.metric_key}
        onChange={(v) => { set('metric_key', v); if (err) setErr('') }}
        placeholder={i18n.t('modalsData:addGoal.pickMetric')}
        options={ALL_METRICS.map((m) => ({ value: m.key, label: `${m.icon} ${metricName(m.key)}` }))}
      />

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:addGoal.goalName')}</Text>
        <TextInput style={styles.input} value={form.label} onChangeText={(v) => set('label', v)} placeholder={i18n.t('modalsData:addGoal.goalNamePlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:addGoal.timeFrame')}</Text>
        <View style={styles.pills}>
          {TIME_FRAMES.map((tf) => {
            const on = form.time_frame === tf.k
            return (
              <Pressable key={tf.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('time_frame', tf.k)}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{tf.l}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{i18n.t('modalsData:addGoal.target')}</Text>
          <TextInput
            style={[styles.input, err && !(parseFloat(form.target_value) > 0) && styles.inputErr]}
            value={form.target_value}
            onChangeText={(v) => { set('target_value', v); if (err) setErr('') }}
            placeholder="0"
            placeholderTextColor={colors.textFaint}
            keyboardType="numeric"
          />
        </View>
        {form.time_frame === 'deadline' ? (
          <View style={styles.flex}>
            <Text style={styles.label}>{i18n.t('modalsData:addGoal.targetDate')}</Text>
            <TextInput style={styles.input} value={form.target_date} onChangeText={(v) => set('target_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
          </View>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:addGoal.importance')}</Text>
        <View style={styles.pills}>
          {IMPORTANCE.map((n) => {
            const on = Number(form.importance) === n
            return (
              <Pressable key={n} style={[styles.pill, on && styles.pillOn]} onPress={() => set('importance', n)}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{n}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <Select
        label={i18n.t('modalsData:addGoal.projectOptional')}
        value={form.project_id}
        onChange={(v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))}
        placeholder={none}
        options={[{ value: '', label: none }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]}
      />
      {groups.filter((g) => g.project_id === form.project_id).length ? (
        <Select
          label={i18n.t('modalsData:addGoal.groupOptional')}
          value={form.group_id}
          onChange={(v) => set('group_id', v)}
          placeholder={none}
          options={[{ value: '', label: none }, ...groups.filter((g) => g.project_id === form.project_id).map((g) => ({ value: g.id, label: g.name || '' }))]}
        />
      ) : null}

      {isManual ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsData:addGoal.tracking')}</Text>
          <View style={styles.pills}>
            <Pressable style={[styles.pill, form.tracking_method === 'manual' && styles.pillOn]} onPress={() => set('tracking_method', 'manual')}>
              <Text style={[styles.pillText, form.tracking_method === 'manual' && styles.pillTextOn]}>{i18n.t('modalsData:addGoal.manualEntry')}</Text>
            </Pressable>
            <Pressable style={[styles.pill, form.tracking_method === 'daily_question' && styles.pillOn]} onPress={() => set('tracking_method', 'daily_question')}>
              <Text style={[styles.pillText, form.tracking_method === 'daily_question' && styles.pillTextOn]}>{i18n.t('modalsData:addGoal.dailyQuestion')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {byQuestion ? (
        <View style={styles.field}>
          {hasActiveQ && canCreateQuestion ? (
            <View style={styles.pills}>
              <Pressable style={[styles.pill, qMode === 'existing' && styles.pillOn]} onPress={() => { set('question_mode', 'existing'); if (err) setErr('') }}>
                <Text style={[styles.pillText, qMode === 'existing' && styles.pillTextOn]}>{i18n.t('modalsData:addGoal.pickExisting')}</Text>
              </Pressable>
              <Pressable style={[styles.pill, qMode === 'new' && styles.pillOn]} onPress={() => { set('question_mode', 'new'); if (err) setErr('') }}>
                <Text style={[styles.pillText, qMode === 'new' && styles.pillTextOn]}>{i18n.t('modalsData:addGoal.newQuestion')}</Text>
              </Pressable>
            </View>
          ) : null}

          {qMode === 'existing' ? (
            hasActiveQ ? (
              <Select
                label={i18n.t('modalsData:addGoal.dailyQuestion')}
                value={form.tracked_by_question_id}
                onChange={(v) => { set('tracked_by_question_id', v); if (err) setErr('') }}
                placeholder={i18n.t('modalsData:addGoal.pickQuestion')}
                options={activeQuestions.map((q) => ({ value: q.id, label: `${q.icon ? q.icon + ' ' : ''}${questionText(q)}` }))}
              />
            ) : (
              <Text style={styles.hint}>{i18n.t('modalsData:addGoal.noActiveQuestions')}</Text>
            )
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={form.question_text}
                onChangeText={(v) => { set('question_text', v); if (err) setErr('') }}
                placeholder={i18n.t(form.question_scale === 'yes_no' ? 'modalsData:addGoal.questionPlaceholderYesNo' : 'modalsData:addGoal.questionPlaceholderSlider')}
                placeholderTextColor={colors.textFaint}
              />
              <Text style={styles.subLabel}>{i18n.t('modalsData:addGoal.answerType')}</Text>
              <View style={styles.pills}>
                {SCALES.map((s) => {
                  const on = form.question_scale === s.k
                  return (
                    <Pressable key={s.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('question_scale', s.k)}>
                      <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsTask:question.${s.l}`)}</Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text style={styles.subLabel}>{i18n.t('modalsData:common.icon', { defaultValue: 'אייקון' })}</Text>
              <View style={styles.iconRow}>
                {ICONS.map((ic) => {
                  const on = form.question_icon === ic
                  return (
                    <Pressable key={ic} style={[styles.iconBtn, on && styles.iconOn]} onPress={() => set('question_icon', ic)}>
                      <Text style={styles.iconGlyph}>{ic}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          )}
        </View>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsData:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsData:common.saving') : i18n.t('modalsData:common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  subLabel: { fontSize: 12, color: colors.textSub, marginTop: 8 },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center', justifyContent: 'center' },
  iconOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  iconGlyph: { fontSize: 18 },
  error: { color: colors.danger, fontSize: 13 },
  hint: { color: colors.textSub, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
