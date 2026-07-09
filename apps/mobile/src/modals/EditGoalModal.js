import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import { questionText, scheduledOccurrences, buildSchedulePattern } from '@simplicity/core'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import ScheduleDayPicker from '../components/ScheduleDayPicker'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Edit a goal (mirrors web EditGoalModal): label / time-frame / target /
// target-date / importance / project+group / delete, PLUS — for manual "other"
// categories — a tracking section (manual vs daily question, with pick / create
// / edit-in-place of the linked question). The metric/category isn't editable.
// onSave(id, patch).
const IMPORTANCE = [1, 2, 3, 4, 5]
const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']
const SCALES = [{ k: '1-10', l: 'scaleRange' }, { k: 'yes_no', l: 'scaleYesNo' }]

// Reverse of buildSchedulePattern → the picker's {mode,days,x} so editing a
// question pre-fills its real cadence (null/empty = every day). Mirrors web.
const patternToSched = (p) => {
  if (p && p.type === 'days_of_week' && Array.isArray(p.values) && p.values.length) return { mode: 'days_of_week', days: p.values, x: 2 }
  if (p && p.type === 'every_x_days') return { mode: 'every_x_days', days: [0, 1, 2, 3, 4, 5, 6], x: Number(p.x) || 2 }
  return { mode: 'every_day', days: [0, 1, 2, 3, 4, 5, 6], x: 2 }
}

const blank = (goal) => ({
  label: goal?.label || '',
  time_frame: goal?.time_frame || 'monthly',
  target_value: goal?.target_value != null ? String(goal.target_value) : '',
  target_date: goal?.target_date ? String(goal.target_date).slice(0, 10) : '',
  importance: goal?.importance ?? 3,
  project_id: goal?.project_id || '',
  group_id: goal?.group_id || '',
  tracking_method: goal?.tracking_method || 'manual',
  tracked_by_question_id: goal?.tracked_by_question_id || '',
  question_mode: 'existing', // 'existing' pick · 'new' write · 'edit' change linked
  question_text: '',
  question_scale: '1-10',
  question_icon: ICONS[0],
  sched_mode: 'every_day',
  sched_days: [0, 1, 2, 3, 4, 5, 6],
  sched_x: 2,
})

export default function EditGoalModal({ open, onClose, onSave, onDelete, goal, categories = [], questions = [], onAddQuestion, onUpdateQuestion }) {
  const { projects = [], groups = [] } = useFormOptions()
  const [form, setForm] = useState(() => blank(goal))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(goal)); setErr(''); setBusy(false) } }, [open, goal])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const TIME_FRAMES = [
    { k: 'monthly', l: i18n.t('modalsData:editGoal.tf.monthly') },
    { k: 'weekly', l: i18n.t('modalsData:editGoal.tf.weekly') },
    { k: 'deadline', l: i18n.t('modalsData:editGoal.tf.deadline') },
  ]

  // Tracking is only offered for manual ("other") categories (mirrors web).
  const cat = categories.find((c) => c.id === goal?.category_id)
  const isManual = cat?.measurement_type === 'manual'
  const byQuestion = isManual && form.tracking_method === 'daily_question'
  const activeQuestions = questions.filter((q) => q.active)
  const hasActiveQ = activeQuestions.length > 0
  const canCreateQuestion = !!onAddQuestion
  const canEditQuestion = !!onUpdateQuestion
  const linkedQuestion = questions.find((q) => q.id === form.tracked_by_question_id) || null

  let qMode = byQuestion ? form.question_mode : null
  if (byQuestion) {
    if (qMode === 'edit' && !(canEditQuestion && linkedQuestion)) qMode = 'existing'
    if (qMode === 'new' && !canCreateQuestion) qMode = 'existing'
    if (qMode === 'existing' && !hasActiveQ) qMode = canCreateQuestion ? 'new' : 'existing'
  }
  const creatingQuestion = qMode === 'new'
  const editingQuestion = qMode === 'edit'
  const authoring = creatingQuestion || editingQuestion

  const startEdit = () => {
    if (!linkedQuestion) return
    const s = patternToSched(linkedQuestion.schedule_pattern)
    setForm((f) => ({ ...f, question_mode: 'edit', question_text: questionText(linkedQuestion), question_scale: linkedQuestion.scale_type || '1-10', question_icon: linkedQuestion.icon || ICONS[0], sched_mode: s.mode, sched_days: s.days, sched_x: s.x }))
    if (err) setErr('')
  }
  const startNew = () => {
    setForm((f) => ({ ...f, question_mode: 'new', question_text: '', question_scale: '1-10', question_icon: ICONS[0], sched_mode: 'every_day', sched_days: [0, 1, 2, 3, 4, 5, 6], sched_x: 2 }))
    if (err) setErr('')
  }

  const selectedQuestion = questions.find((q) => q.id === form.tracked_by_question_id)
  const newSchedPattern = authoring ? buildSchedulePattern(form.sched_mode, form.sched_days, form.sched_x) : null
  const noDays = authoring && form.sched_mode === 'days_of_week' && form.sched_days.length === 0
  const effIsYesNo = authoring ? form.question_scale === 'yes_no' : (byQuestion && selectedQuestion?.scale_type === 'yes_no')
  const effPattern = authoring ? newSchedPattern : selectedQuestion?.schedule_pattern
  const maxOccurrences = effIsYesNo ? scheduledOccurrences(effPattern, form.time_frame, form.target_date) : null
  const overMax = effIsYesNo && parseFloat(form.target_value) > maxOccurrences

  const doRemove = async () => {
    setBusy(true)
    try { await onDelete(goal.id); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') })) }
  }
  const remove = () => {
    if (busy || !onDelete) return
    Alert.alert(
      i18n.t('goals:delete.title', { defaultValue: 'מחיקת יעד' }),
      i18n.t('goals:delete.messageNamed', { label: goal?.label || '', defaultValue: 'למחוק את היעד? ניתן לשחזר מסל המיחזור תוך 30 יום.' }),
      [
        { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
        { text: i18n.t('goals:delete.confirm', { defaultValue: 'מחק' }), style: 'destructive', onPress: doRemove },
      ],
    )
  }

  const submit = async () => {
    const target = parseFloat(form.target_value)
    if (!target || target <= 0) { setErr(i18n.t('modalsData:editGoal.needTarget')); return }
    if (form.time_frame === 'deadline' && !form.target_date) { setErr(i18n.t('modalsData:editGoal.needTargetDate')); return }
    if (byQuestion && authoring && !form.question_text.trim()) { setErr(i18n.t('modalsData:addGoal.needQuestionText')); return }
    if (byQuestion && authoring && noDays) { setErr(i18n.t('modalsData:addGoal.needAtLeastOneDay')); return }
    if (byQuestion && !authoring && !form.tracked_by_question_id) { setErr(i18n.t('modalsData:editGoal.needQuestion')); return }
    if (overMax) { setErr(i18n.t('modalsData:addGoal.overMaxError', { max: maxOccurrences })); return }
    setBusy(true)
    setErr('')
    try {
      let questionId = form.tracked_by_question_id
      if (byQuestion && creatingQuestion) {
        const q = await onAddQuestion({ template_key: null, custom_text: form.question_text.trim(), scale_type: form.question_scale, icon: form.question_icon, active: true, schedule_pattern: newSchedPattern || {} })
        questionId = q.id
      } else if (byQuestion && editingQuestion && linkedQuestion) {
        await onUpdateQuestion(linkedQuestion.id, { template_key: null, custom_text: form.question_text.trim(), scale_type: form.question_scale, icon: form.question_icon, schedule_pattern: newSchedPattern || {} })
        questionId = linkedQuestion.id
      }
      await onSave(goal.id, {
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        project_id: form.project_id || null,
        group_id: form.project_id && form.group_id ? form.group_id : null,
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: byQuestion ? questionId : null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') }))
    }
  }

  const none = i18n.t('modalsData:common.none')
  const projectGroups = groups.filter((g) => g.project_id === form.project_id)
  const showTrackPills = ((hasActiveQ ? 1 : 0) + (canCreateQuestion ? 1 : 0) + (canEditQuestion && linkedQuestion ? 1 : 0)) > 1

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsData:editGoal.title')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:editGoal.goalName')}</Text>
        <TextInput style={styles.input} value={form.label} onChangeText={(v) => set('label', v)} placeholder={cat?.name || i18n.t('modalsData:editGoal.goalNamePlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:editGoal.timeFrame')}</Text>
        <View style={styles.pills}>
          {TIME_FRAMES.map((tf) => { const on = form.time_frame === tf.k; return (
            <Pressable key={tf.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('time_frame', tf.k)}><Text style={[styles.pillText, on && styles.pillTextOn]}>{tf.l}</Text></Pressable>
          ) })}
        </View>
      </View>

      <View style={styles.row2}>
        <View style={styles.flex}>
          <Text style={styles.label}>{i18n.t('modalsData:editGoal.target')}</Text>
          <TextInput style={[styles.input, err && !(parseFloat(form.target_value) > 0) && styles.inputErr]} value={form.target_value} onChangeText={(v) => { set('target_value', v); if (err) setErr('') }} placeholder="0" placeholderTextColor={colors.textFaint} keyboardType="numeric" />
        </View>
        {form.time_frame === 'deadline' ? (
          <View style={styles.flex}>
            <Text style={styles.label}>{i18n.t('modalsData:editGoal.targetDate')}</Text>
            <TextInput style={styles.input} value={form.target_date} onChangeText={(v) => set('target_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
          </View>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:editGoal.importance')}</Text>
        <View style={styles.pills}>
          {IMPORTANCE.map((n) => { const on = Number(form.importance) === n; return (
            <Pressable key={n} style={[styles.pill, on && styles.pillOn]} onPress={() => set('importance', n)}><Text style={[styles.pillText, on && styles.pillTextOn]}>{n}</Text></Pressable>
          ) })}
        </View>
      </View>

      {projects.length ? (
        <Select label={i18n.t('modalsData:editGoal.projectOptional')} value={form.project_id} onChange={(v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))} placeholder={none}
          options={[{ value: '', label: none }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]} />
      ) : null}
      {projectGroups.length ? (
        <Select label={i18n.t('modalsData:editGoal.groupOptional')} value={form.group_id} onChange={(v) => set('group_id', v)} placeholder={i18n.t('modalsData:editGoal.noGroup')}
          options={[{ value: '', label: i18n.t('modalsData:editGoal.noGroup') }, ...projectGroups.map((g) => ({ value: g.id, label: g.name || '' }))]} />
      ) : null}

      {/* Tracking — manual categories only (mirrors web) */}
      {isManual ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsData:editGoal.tracking')}</Text>
          <View style={styles.pills}>
            <Pressable style={[styles.pill, form.tracking_method === 'manual' && styles.pillOn]} onPress={() => set('tracking_method', 'manual')}><Text style={[styles.pillText, form.tracking_method === 'manual' && styles.pillTextOn]}>{i18n.t('modalsData:editGoal.manualEntry')}</Text></Pressable>
            <Pressable style={[styles.pill, form.tracking_method === 'daily_question' && styles.pillOn]} onPress={() => set('tracking_method', 'daily_question')}><Text style={[styles.pillText, form.tracking_method === 'daily_question' && styles.pillTextOn]}>{i18n.t('modalsData:editGoal.dailyQuestion')}</Text></Pressable>
          </View>
        </View>
      ) : null}

      {byQuestion ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsData:editGoal.dailyQuestion')}</Text>
          {showTrackPills ? (
            <View style={styles.pills}>
              {hasActiveQ ? <Pressable style={[styles.pill, qMode === 'existing' && styles.pillOn]} onPress={() => { set('question_mode', 'existing'); if (err) setErr('') }}><Text style={[styles.pillText, qMode === 'existing' && styles.pillTextOn]}>{i18n.t('modalsData:addGoal.pickExisting')}</Text></Pressable> : null}
              {canCreateQuestion ? <Pressable style={[styles.pill, qMode === 'new' && styles.pillOn]} onPress={startNew}><Text style={[styles.pillText, qMode === 'new' && styles.pillTextOn]}>{i18n.t('modalsData:addGoal.newQuestion')}</Text></Pressable> : null}
              {canEditQuestion && linkedQuestion ? <Pressable style={[styles.pill, qMode === 'edit' && styles.pillOn]} onPress={startEdit}><Text style={[styles.pillText, qMode === 'edit' && styles.pillTextOn]}>{i18n.t('modalsData:editGoal.editQuestion')}</Text></Pressable> : null}
            </View>
          ) : null}

          {qMode === 'existing' ? (
            hasActiveQ ? (
              <Select value={form.tracked_by_question_id} onChange={(v) => { set('tracked_by_question_id', v); if (err) setErr('') }} placeholder={i18n.t('modalsData:editGoal.pickQuestion')}
                options={activeQuestions.map((q) => ({ value: q.id, label: `${q.icon ? q.icon + ' ' : ''}${questionText(q)}` }))} />
            ) : (
              <Text style={styles.error}>{i18n.t('modalsData:editGoal.noActiveQuestions')}</Text>
            )
          ) : (
            <>
              <TextInput style={styles.input} value={form.question_text} onChangeText={(v) => { set('question_text', v); if (err) setErr('') }} placeholder={i18n.t(form.question_scale === 'yes_no' ? 'modalsData:addGoal.questionPlaceholderYesNo' : 'modalsData:addGoal.questionPlaceholderSlider')} placeholderTextColor={colors.textFaint} />
              <Text style={styles.subLabel}>{i18n.t('modalsData:addGoal.answerType')}</Text>
              <View style={styles.pills}>
                {SCALES.map((s) => { const on = form.question_scale === s.k; return (
                  <Pressable key={s.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('question_scale', s.k)}><Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsTask:question.${s.l}`)}</Text></Pressable>
                ) })}
              </View>
              <Text style={styles.subLabel}>{i18n.t('modalsData:common.icon', { defaultValue: 'אייקון' })}</Text>
              <View style={styles.iconRow}>
                {ICONS.map((ic) => { const on = form.question_icon === ic; return (
                  <Pressable key={ic} style={[styles.iconBtn, on && styles.iconOn]} onPress={() => set('question_icon', ic)}><Text style={styles.iconGlyph}>{ic}</Text></Pressable>
                ) })}
              </View>
              <Text style={styles.subLabel}>{i18n.t('modalsData:addGoal.whenAsked')}</Text>
              <ScheduleDayPicker mode={form.sched_mode} days={form.sched_days} x={form.sched_x} onChange={({ mode, days, x }) => { setForm((f) => ({ ...f, sched_mode: mode, sched_days: days, sched_x: x })); if (err) setErr('') }} />
            </>
          )}

          {effIsYesNo ? (
            <Text style={overMax ? styles.error : styles.hint}>
              {overMax
                ? i18n.t('modalsData:addGoal.overMaxWarn', { target: parseFloat(form.target_value), max: maxOccurrences })
                : i18n.t('modalsData:addGoal.freqHint', { max: maxOccurrences, period: i18n.t(`modalsData:addGoal.period.${form.time_frame}`) })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}><Trash2 size={18} strokeWidth={1.8} color={colors.danger} /></Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsData:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}><Text style={styles.saveText}>{busy ? i18n.t('modalsData:common.saving') : i18n.t('modalsData:common.save')}</Text></Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  subLabel: { fontSize: 12, color: colors.textSub, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { flexGrow: 1, minWidth: 64, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center', justifyContent: 'center' },
  iconOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  iconGlyph: { fontSize: 18 },
  hint: { color: colors.textSub, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
