import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Edit a goal (mirrors web EditGoalModal's core: label / time-frame / target /
// target-date / importance / project+group + delete). The metric isn't editable
// (a goal keeps its category); the daily-question tracking path is deferred.
// onSave(id, patch).
const IMPORTANCE = [1, 2, 3, 4, 5]
const blank = (goal) => ({
  label: goal?.label || '',
  time_frame: goal?.time_frame || 'monthly',
  target_value: goal?.target_value != null ? String(goal.target_value) : '',
  target_date: goal?.target_date ? String(goal.target_date).slice(0, 10) : '',
  importance: goal?.importance ?? 3,
  project_id: goal?.project_id || '',
  group_id: goal?.group_id || '',
})

export default function EditGoalModal({ open, onClose, onSave, onDelete, goal }) {
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
    setBusy(true)
    setErr('')
    try {
      await onSave(goal.id, {
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        project_id: form.project_id || null,
        group_id: form.group_id || null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsData:editGoal.title')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:editGoal.goalName')}</Text>
        <TextInput style={styles.input} value={form.label} onChangeText={(v) => set('label', v)} placeholder={i18n.t('modalsData:editGoal.goalNamePlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:editGoal.timeFrame')}</Text>
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
          <Text style={styles.label}>{i18n.t('modalsData:editGoal.target')}</Text>
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
            <Text style={styles.label}>{i18n.t('modalsData:editGoal.targetDate')}</Text>
            <TextInput style={styles.input} value={form.target_date} onChangeText={(v) => set('target_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
          </View>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:editGoal.importance')}</Text>
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

      {projects.length ? (
        <Select
          label={i18n.t('modalsData:editGoal.projectOptional')}
          value={form.project_id}
          onChange={(v) => setForm((f) => ({ ...f, project_id: v, group_id: '' }))}
          placeholder={i18n.t('modalsData:common.none')}
          options={[{ value: '', label: i18n.t('modalsData:common.none') }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]}
        />
      ) : null}
      {groups.filter((g) => g.project_id === form.project_id).length ? (
        <Select
          label={i18n.t('modalsData:editGoal.groupOptional')}
          value={form.group_id}
          onChange={(v) => set('group_id', v)}
          placeholder={i18n.t('modalsData:common.none')}
          options={[{ value: '', label: i18n.t('modalsData:common.none') }, ...groups.filter((g) => g.project_id === form.project_id).map((g) => ({ value: g.id, label: g.name || '' }))]}
        />
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}>
            <Trash2 size={18} strokeWidth={1.8} color={colors.danger} />
          </Pressable>
        ) : null}
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
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
