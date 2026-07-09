import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Quick-schedule a meeting (mirrors web ScheduleMeetingModal): pick a client +
// date + time. When a single `client` is locked and onSetRecurringSlot is wired
// (opened from the client drawer), a "שעה קבועה" toggle sets the client's weekly
// recurring slot and lets the engine build the series (overwrite confirmed once).
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ client_id: '', date: todayStr(), time: '09:00' })

export default function AddMeetingModal({ open, onClose, onSave, clients: propClients = [], client = null, onSetRecurringSlot }) {
  const { clients: optClients } = useFormOptions()
  const clients = propClients.length ? propClients : optClients
  const [form, setForm] = useState(blank)
  const [recurring, setRecurring] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setRecurring(false); setConfirmReplace(false); setErr(''); setBusy(false); onClose() }

  const canRecur = !!(client && onSetRecurringSlot)
  const slotDow = new Date(`${form.date || todayStr()}T${form.time || '09:00'}`).getDay()
  const hasExistingSlot = !!(client && client.recurring_day != null && client.recurring_time)
  const showReplaceWarning = recurring && confirmReplace && hasExistingSlot

  const submit = async () => {
    const clientId = client?.id || form.client_id
    if (!clientId) { setErr(i18n.t('modalsTask:meeting.clientRequired')); return }
    const scheduled = new Date(`${form.date}T${form.time || '09:00'}`)
    if (Number.isNaN(scheduled.getTime())) { setErr(i18n.t('modalsTask:meeting.dateTimeRequired')); return }
    setErr('')

    // Recurring path — set the client's weekly slot; the engine builds the series.
    if (recurring && canRecur) {
      if (hasExistingSlot && !confirmReplace) { setConfirmReplace(true); return }
      setBusy(true)
      try {
        await onSetRecurringSlot(clientId, { recurring_day: slotDow, recurring_time: form.time, recurring_start_date: form.date, recurring_end_date: null })
        close()
      } catch (e) {
        setBusy(false)
        setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
      }
      return
    }

    setBusy(true)
    try {
      await onSave({ subject_type: 'client', subject_id: clientId, scheduled_at: scheduled.toISOString(), status: 'pending', session_id: null })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsTask:meeting.title')}>
      {client ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:meeting.client')}</Text>
          <Text style={styles.lockedClient}>{client.name || ''}</Text>
        </View>
      ) : (
        <Select
          label={i18n.t('modalsTask:meeting.client')}
          value={form.client_id}
          onChange={(v) => { set('client_id', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsTask:meeting.pickClient')}
          options={clients.map((c) => ({ value: c.id, label: c.name || '' }))}
        />
      )}

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

      {canRecur ? (
        <View style={styles.field}>
          <View style={styles.pills}>
            <Pressable style={[styles.pill, !recurring && styles.pillOn]} onPress={() => { setRecurring(false); setConfirmReplace(false) }}>
              <Text style={[styles.pillText, !recurring && styles.pillTextOn]}>{i18n.t('modalsTask:meeting.once')}</Text>
            </Pressable>
            <Pressable style={[styles.pill, recurring && styles.pillOn]} onPress={() => setRecurring(true)}>
              <Text style={[styles.pillText, recurring && styles.pillTextOn]}>{i18n.t('modalsTask:meeting.recurring')}</Text>
            </Pressable>
          </View>
          {recurring ? (
            <Text style={styles.hint}>{i18n.t('modalsTask:meeting.recurringHint', { day: i18n.t(`modalsClient:common.day${slotDow}`), time: form.time })}</Text>
          ) : null}
        </View>
      ) : null}
      {showReplaceWarning ? (
        <Text style={styles.warn}>{i18n.t('modalsTask:meeting.replaceWarning', { day: i18n.t(`modalsClient:common.day${client.recurring_day}`), time: client.recurring_time })}</Text>
      ) : null}

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsTask:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsTask:common.saving') : (showReplaceWarning ? i18n.t('modalsTask:meeting.replaceConfirm') : i18n.t('modalsTask:common.save'))}</Text>
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
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  lockedClient: { fontSize: 15, fontWeight: '600', color: colors.text, paddingVertical: 4 },
  hint: { fontSize: 12, color: colors.textFaint, lineHeight: 16 },
  warn: { fontSize: 12, color: colors.danger, lineHeight: 16 },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})
