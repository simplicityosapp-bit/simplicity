import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a project (mirrors web AddProjectModal: name + color swatch). Pass a
// `project` to edit it (prefills + shows delete).
const SWATCHES = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']
const blank = (project) => ({ name: project?.name || '', color: project?.color || SWATCHES[0] })

export default function AddProjectModal({ open, onClose, onSave, onDelete, project = null }) {
  const isEdit = !!project
  const [form, setForm] = useState(() => blank(project))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(project)); setErr(''); setBusy(false) } }, [open, project])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const doRemove = async () => {
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') })) }
  }
  const remove = () => {
    if (busy || !onDelete) return
    Alert.alert(
      i18n.t('projects:delete.title', { defaultValue: 'מחיקת פרויקט' }),
      i18n.t('projects:delete.message', { name: project?.name || '', defaultValue: 'למחוק את הפרויקט?' }),
      [
        { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
        { text: i18n.t('projects:delete.confirm', { defaultValue: 'מחק' }), style: 'destructive', onPress: doRemove },
      ],
    )
  }

  const submit = async () => {
    if (!form.name.trim()) { setErr(i18n.t('modalsData:common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({ name: form.name.trim(), color: form.color })
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsData:common.saveFailed', { error: e.message || i18n.t('modalsData:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t(isEdit ? 'projects:card.editTitle' : 'modalsData:addProject.title', { defaultValue: isEdit ? 'ערוך פרויקט' : 'פרויקט חדש' })}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:addProject.projectName')}</Text>
        <TextInput
          style={[styles.input, err && !form.name.trim() && styles.inputErr]}
          value={form.name}
          onChangeText={(v) => { set('name', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsData:addProject.namePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:common.color')}</Text>
        <View style={styles.swatches}>
          {SWATCHES.map((c) => (
            <Pressable
              key={c}
              style={[styles.swatch, { backgroundColor: c }, form.color === c && styles.swatchOn]}
              onPress={() => set('color', c)}
            />
          ))}
        </View>
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}><Trash2 size={18} strokeWidth={1.8} color={colors.danger} /></Pressable>
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
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 2 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: colors.text },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})
