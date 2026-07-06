import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Log/edit a past session (mirrors web AddSessionModal): when + summary + notes.
// The caller composes the full sessions row (client_id / subject_type / num);
// onSave gets { date: ISO, summary, notes }.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fromSession = (s) => (s
  ? { date: s.date ? new Date(s.date).toISOString().slice(0, 10) : todayStr(), summary: s.summary || '', notes: s.notes || '' }
  : { date: todayStr(), summary: '', notes: '' })

export default function AddSessionModal({ open, onClose, onSave, client, nextNum, session = null }) {
  const isEdit = !!session
  const [form, setForm] = useState(() => fromSession(session))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(fromSession(session)); setErr(''); setBusy(false) } }, [open, session])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.date) { setErr(i18n.t('modalsTask:session.dateRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        date: new Date(`${form.date}T12:00:00`).toISOString(),
        summary: form.summary.trim() || null,
        notes: form.notes.trim() || null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={isEdit ? i18n.t('modalsTask:session.titleEdit') : i18n.t('modalsTask:session.titleNew')}>
      {client ? (
        <View style={styles.sub}>
          <View style={styles.subDot} />
          <Text style={styles.subText}>{client.name}{nextNum ? ` · ${i18n.t('modalsTask:session.meetingNum', { num: nextNum })}` : ''}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:session.date')}</Text>
        <TextInput style={styles.input} value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:session.summary')}</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.summary}
          onChangeText={(v) => set('summary', v)}
          placeholder={i18n.t('modalsTask:session.summaryPlaceholder')}
          placeholderTextColor={colors.textFaint}
          multiline
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:session.notes')}</Text>
        <TextInput style={styles.input} value={form.notes} onChangeText={(v) => set('notes', v)} placeholder={i18n.t('modalsTask:session.notesPlaceholder')} placeholderTextColor={colors.textFaint} />
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
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.positive },
  subText: { fontSize: 13, color: colors.textSub },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  textarea: { minHeight: 76, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
