import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Quick-add a task (mirrors web AddTaskModal's core: title + priority). The
// optional project/client/due-date fields are a later increment; onSave gets a
// tasks-ready row (status:'todo' filled by the caller/mutation).
const PRIORITIES = [
  { k: 'high', l: 'priorityHigh' },
  { k: 'medium', l: 'priorityMedium' },
  { k: 'low', l: 'priorityLow' },
]
const blank = () => ({ title: '', priority: 'medium' })

export default function AddTaskModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr(i18n.t('modalsTask:task.titleRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({ title: form.title.trim(), priority: form.priority })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t('modalsTask:task.titleNew')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:task.whatToDo')}</Text>
        <TextInput
          style={[styles.input, err && !form.title.trim() && styles.inputErr]}
          value={form.title}
          onChangeText={(v) => { set('title', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsTask:task.titlePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsTask:task.priority')}</Text>
        <View style={styles.pills}>
          {PRIORITIES.map((p) => {
            const on = form.priority === p.k
            return (
              <Pressable key={p.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('priority', p.k)}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsTask:task.${p.l}`)}</Text>
              </Pressable>
            )
          })}
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
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
