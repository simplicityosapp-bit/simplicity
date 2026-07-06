import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a lead (mirrors web AddLeadModal's core: name + phone + source +
// follow-up date; new leads land in the "בתהליך" column). Pass a `lead` to edit.
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = (lead) => ({
  name: lead?.name || '',
  phone: lead?.phone || '',
  source_id: lead?.source_id || '',
  follow_up_date: lead?.follow_up_date ? String(lead.follow_up_date).slice(0, 10) : '',
})

export default function AddLeadModal({ open, onClose, onSave, onDelete, lead = null }) {
  const isEdit = !!lead
  const { leadSources } = useFormOptions()
  const [form, setForm] = useState(() => blank(lead))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(lead)); setErr(''); setBusy(false) } }, [open, lead])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsClient:common.saveFailed', { error: e.message || i18n.t('modalsClient:common.tryAgain') })) }
  }

  const submit = async () => {
    if (!form.name.trim()) { setErr(i18n.t('modalsClient:addLead.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      const payload = isEdit
        ? { name: form.name.trim(), phone: form.phone.trim() || null, source_id: form.source_id || null, follow_up_date: form.follow_up_date || null }
        : {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          source_id: form.source_id || null, project_id: null, group_id: null,
          status: 'new', status_id: null, status_meta: 'in_process',
          inquiry_date: todayStr(), follow_up_date: form.follow_up_date || null,
          last_status_changed_at: new Date().toISOString(),
          notes: null, converted_to_client_id: null, converted_at: null,
        }
      await onSave(payload)
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsClient:common.saveFailed', { error: e.message || i18n.t('modalsClient:common.tryAgain') }))
    }
  }

  const none = i18n.t('modalsClient:common.none')

  return (
    <Sheet open={open} onClose={close} title={i18n.t(isEdit ? 'modalsClient:editLead.title' : 'modalsClient:addLead.title')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.name')}</Text>
        <TextInput
          style={[styles.input, err && !form.name.trim() && styles.inputErr]}
          value={form.name}
          onChangeText={(v) => { set('name', v); if (err) setErr('') }}
          placeholder={i18n.t('modalsClient:addLead.namePlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.phone')}</Text>
        <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder={i18n.t('modalsClient:common.phonePlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="phone-pad" />
      </View>

      <Select
        label={i18n.t('modalsClient:common.source')}
        value={form.source_id}
        onChange={(v) => set('source_id', v)}
        placeholder={none}
        options={[{ value: '', label: none }, ...leadSources.map((s) => ({ value: s.id, label: s.name || '' }))]}
      />
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.followUp')}</Text>
        <TextInput style={styles.input} value={form.follow_up_date} onChangeText={(v) => set('follow_up_date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} />
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        {isEdit && onDelete ? (
          <Pressable style={styles.delete} onPress={remove} disabled={busy} hitSlop={6}>
            <Trash2 size={18} strokeWidth={1.8} color={colors.danger} />
          </Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsClient:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsClient:common.saving') : i18n.t('modalsClient:common.save')}</Text>
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
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  delete: { width: 46, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
