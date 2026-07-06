import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import { ALL_METRICS, metricName } from '../lib/goalPresets'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add a goal (mirrors web AddGoalModal's core: metric + name + time-frame +
// target + importance + project). The manual metric's daily-question tracking
// path (inline question authoring + schedule) is a later increment — tracking
// stays 'manual'. onSave resolves metric_key → category (useGoalsData.addGoal).
const IMPORTANCE = [1, 2, 3, 4, 5]
const blank = () => ({ metric_key: '', label: '', time_frame: 'monthly', target_value: '', target_date: '', importance: 3, project_id: '' })

export default function AddGoalModal({ open, onClose, onSave }) {
  const { projects } = useFormOptions()
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

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
    setBusy(true)
    setErr('')
    try {
      await onSave({
        metric_key: form.metric_key,
        parent_goal_id: null,
        project_id: form.project_id || null,
        group_id: null,
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        tracking_method: 'manual',
        tracked_by_question_id: null,
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
        onChange={(v) => set('project_id', v)}
        placeholder={none}
        options={[{ value: '', label: none }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]}
      />

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
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
