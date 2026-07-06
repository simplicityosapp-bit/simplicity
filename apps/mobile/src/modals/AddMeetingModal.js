import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Quick-schedule a one-off meeting (mirrors web ScheduleMeetingModal's core:
// pick a client + date + time). The recurring "שעה קבועה" option is a later
// increment; onSave gets a scheduled_meetings-ready row.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ client_id: '', date: todayStr(), time: '09:00' })

export default function AddMeetingModal({ open, onClose, onSave, clients: propClients = [] }) {
  const { clients: optClients } = useFormOptions()
  const clients = propClients.length ? propClients : optClients
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.client_id) { setErr(i18n.t('modalsTask:meeting.clientRequired')); return }
    const scheduled = new Date(`${form.date}T${form.time || '09:00'}`)
    if (Number.isNaN(scheduled.getTime())) { setErr(i18n.t('modalsTask:meeting.dateTimeRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({ subject_type: 'client', subject_id: form.client_id, scheduled_at: scheduled.toISOString(), status: 'pending', session_id: null })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsTask:meeting.title')}>
      <Select
        label={i18n.t('modalsTask:meeting.client')}
        value={form.client_id}
        onChange={(v) => { set('client_id', v); if (err) setErr('') }}
        placeholder={i18n.t('modalsTask:meeting.pickClient')}
        options={clients.map((c) => ({ value: c.id, label: c.name || '' }))}
      />

      <View style={styles.row2}>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsTask:meeting.date')}</Text>
          <TextInput style={styles.input} value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
        </View>
        <View style={styles.fieldFlex}>
          <Text style={styles.label}>{i18n.t('modalsTask:meeting.time')}</Text>
          <TextInput style={styles.input} value={form.time} onChangeText={(v) => set('time', v)} placeholder="09:00" placeholderTextColor={colors.textFaint} />
        </View>
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
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
