import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Quick-add a one-time reminder (mirrors web AddReminderModal's core: title +
// date + time + details). Recurrence (weekly/monthly/every-x) and client/
// category links are a later increment — this creates a single-shot reminder.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ title: '', description: '', date: todayStr(), time: '09:00' })

export default function AddReminderModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr(i18n.t('modalsTask:reminder.titleRequired')); return }
    const scheduled = new Date(`${form.date}T${form.time || '09:00'}`)
    if (Number.isNaN(scheduled.getTime())) { setErr(i18n.t('modalsTask:reminder.invalidDateTime')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || null,
        scheduled_at: scheduled.toISOString(),
        recurrence_type: 'none',
        recurrence_pattern: null,
        end_date: null,
        linked_to_type: null,
        linked_to_id: null,
        category_id: null,
        status: 'pending', type: null, channel: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsTask:reminder.titleNew')}>
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
        <Text style={styles.label}>{i18n.t('modalsTask:reminder.details')}</Text>
        <TextInput style={styles.input} value={form.description} onChangeText={(v) => set('description', v)} placeholder={i18n.t('modalsTask:reminder.detailsPlaceholder')} placeholderTextColor={colors.textFaint} />
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
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
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
