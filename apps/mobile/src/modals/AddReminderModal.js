import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a reminder (mirrors web AddReminderModal: title + date + time +
// recurrence + details). Pass a `reminder` to edit it (prefills + shows delete).
// Recurrence authoring (once / weekly / monthly-date / every-x-days) is wired via
// the RECUR pills + recurrencePayload below.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const RECUR = [
  { k: 'none', l: 'recOnce' },
  { k: 'weekly', l: 'recWeekly' },
  { k: 'monthly_date', l: 'recMonthly' },
  { k: 'every_x_days', l: 'recEveryX' },
]
const fromReminder = (r) => {
  if (!r) return { title: '', description: '', date: todayStr(), time: '09:00', recurrence: 'none', interval: '2', client_id: '', category_id: '', end_date: '' }
  const d = r.scheduled_at ? new Date(r.scheduled_at) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return {
    title: r.title || '',
    description: r.description || '',
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    recurrence: r.recurrence_type || 'none',
    interval: String(r.recurrence_pattern?.x ?? 2),
    client_id: (r.linked_to_type === 'client' && r.linked_to_id) ? r.linked_to_id : '',
    category_id: r.category_id || '',
    end_date: r.end_date || '',
  }
}
// Pattern KEYS must match what core/reminders.ts reads: dayOfWeek / dayOfMonth / x
// (the shared engine drives both web + mobile, so a wrong key silently breaks the
// schedule — e.g. every_x under the old `interval` key read as every 1 day).
const recurrencePayload = (recurrence, scheduled, interval) => {
  if (recurrence === 'weekly') return { recurrence_type: 'weekly', recurrence_pattern: { dayOfWeek: scheduled.getDay() } }
  if (recurrence === 'monthly_date') return { recurrence_type: 'monthly_date', recurrence_pattern: { dayOfMonth: scheduled.getDate() } }
  if (recurrence === 'every_x_days') return { recurrence_type: 'every_x_days', recurrence_pattern: { x: Number(interval) || 2 } }
  return { recurrence_type: 'none', recurrence_pattern: null }
}

export default function AddReminderModal({ open, onClose, onSave, onDelete, reminder = null }) {
  const isEdit = !!reminder
  const { clients = [], taskCategories = [] } = useFormOptions()
  const [form, setForm] = useState(() => fromReminder(reminder))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(fromReminder(reminder)); setErr(''); setBusy(false) } }, [open, reminder])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') })) }
  }

  const submit = async () => {
    if (!form.title.trim()) { setErr(i18n.t('modalsTask:reminder.titleRequired')); return }
    const scheduled = new Date(`${form.date}T${form.time || '09:00'}`)
    if (Number.isNaN(scheduled.getTime())) { setErr(i18n.t('modalsTask:reminder.invalidDateTime')); return }
    // An end date only applies to a recurring reminder, and can't precede the first occurrence.
    const hasEnd = form.recurrence !== 'none' && form.end_date
    if (hasEnd && new Date(`${form.end_date}T23:59:59`) < scheduled) { setErr(i18n.t('modalsTask:reminder.endBeforeFirst')); return }
    setBusy(true)
    setErr('')
    try {
      const rec = recurrencePayload(form.recurrence, scheduled, form.interval)
      const common = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        scheduled_at: scheduled.toISOString(),
        end_date: hasEnd ? form.end_date : null,
        linked_to_type: form.client_id ? 'client' : null,
        linked_to_id: form.client_id || null,
        category_id: form.category_id || null,
        ...rec,
      }
      await onSave(isEdit ? common : { ...common, status: 'pending', type: null, channel: null })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={isEdit ? i18n.t('modalsTask:reminder.titleEdit', { defaultValue: i18n.t('modalsTask:reminder.titleNew') }) : i18n.t('modalsTask:reminder.titleNew')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:reminder.what')}</Text>
        <TextInput
          style={[styles.input, err && !form.title.trim() && styles.inputErr]}
          value={form.title}
          onChangeText={(v) => { set('title', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsTask:reminder.titlePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>
      <View style={styles.row2}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsTask:reminder.date')}</Text>
          <TextInput style={styles.input} value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsTask:reminder.time')}</Text>
          <TextInput style={styles.input} value={form.time} onChangeText={(v) => set('time', v)} placeholder="09:00" placeholderTextColor={colors.textFaint} />
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:reminder.recurrence')}</Text>
        <View style={styles.pills}>
          {RECUR.map((r) => {
            const on = form.recurrence === r.k
            return (
              <Pressable key={r.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('recurrence', r.k)}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsTask:reminder.${r.l}`)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      {form.recurrence === 'every_x_days' ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:reminder.everyHowMany', { defaultValue: 'כל כמה ימים' })}</Text>
          <TextInput style={styles.input} value={form.interval} onChangeText={(v) => set('interval', v)} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
        </View>
      ) : null}
      {form.recurrence !== 'none' ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:reminder.endDate', { defaultValue: 'תאריך סיום (אופציונלי)' })}</Text>
          <TextInput style={styles.input} value={form.end_date} onChangeText={(v) => set('end_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
      ) : null}

      <Select
        label={i18n.t('modalsTask:reminder.linkedClient', { defaultValue: 'לקוח מקושר (אופציונלי)' })}
        value={form.client_id}
        onChange={(v) => set('client_id', v)}
        placeholder={i18n.t('modalsTask:common.none')}
        options={[{ value: '', label: i18n.t('modalsTask:common.none') }, ...clients.map((c) => ({ value: c.id, label: c.name || '' }))]}
      />
      {taskCategories.length ? (
        <Select
          label={i18n.t('modalsTask:reminder.category', { defaultValue: 'קטגוריה (אופציונלי)' })}
          value={form.category_id}
          onChange={(v) => set('category_id', v)}
          placeholder={i18n.t('modalsTask:common.none')}
          options={[{ value: '', label: i18n.t('modalsTask:common.none') }, ...taskCategories.map((c) => ({ value: c.id, label: c.name || '' }))]}
        />
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:reminder.details')}</Text>
        <TextInput style={styles.input} value={form.description} onChangeText={(v) => set('description', v)} placeholder={i18n.t('modalsTask:reminder.detailsPlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}><Trash2 size={18} strokeWidth={1.8} color={colors.danger} /></Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsTask:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsTask:common.saving') : i18n.t('modalsTask:common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldFlex: { flex: 1, gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.textSub },
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
