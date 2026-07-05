import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Log a manual progress entry for a goal category (mirrors web AddGoalEntryModal).
// onSave receives a goal_entries-ready row (category_id from the picked category).
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = () => ({ value: '', date: todayStr(), note: '' })

export default function AddGoalEntryModal({ open, onClose, onSave, category }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    const value = parseFloat(form.value)
    if (Number.isNaN(value)) { setErr(i18n.t('modalsData:goalEntry.needValue')); return }
    if (!form.date) { setErr(i18n.t('modalsData:goalEntry.needDate')); return }
    if (form.date > todayStr()) { setErr(i18n.t('modalsData:goalEntry.noFutureDate')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({ category_id: category.id, project_id: null, group_id: null, date: form.date, value, note: form.note.trim() || null })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsData:goalEntry.title')}>
      {category ? (
        <View style={styles.subRow}>
          <View style={[styles.dot, { backgroundColor: category.color || colors.textSub }]} />
          <Text style={styles.sub}>{category.icon ? `${category.icon} ` : ''}{category.name}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:goalEntry.value')}</Text>
        <TextInput
          style={[styles.input, err && Number.isNaN(parseFloat(form.value)) && styles.inputErr]}
          value={form.value}
          onChangeText={(v) => { set('value', v); if (err) setErr('') }}
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:common.date')}</Text>
        <TextInput
          style={styles.input}
          value={form.date}
          onChangeText={(v) => set('date', v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textFaint}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:goalEntry.noteOptional')}</Text>
        <TextInput
          style={styles.input}
          value={form.note}
          onChangeText={(v) => set('note', v)}
          placeholder={i18n.t('modalsData:goalEntry.notePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>

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
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sub: { fontSize: 14, color: colors.textSub },
  field: { gap: 6 },
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
