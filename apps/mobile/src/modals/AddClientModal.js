import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add/edit a client (mirrors web AddClientModal's core: name + phone; new
// clients land 'active'). Pass a `client` to edit it (prefills + shows delete);
// billing/price/status/project selects are a later increment — defaulted here
// to match the web insert payload on create.
const blank = (client) => ({ name: client?.name || '', phone: client?.phone || '' })

export default function AddClientModal({ open, onClose, onSave, onDelete, client = null }) {
  const isEdit = !!client
  const [form, setForm] = useState(() => blank(client))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  useEffect(() => { if (open) { setForm(blank(client)); setErr(''); setBusy(false) } }, [open, client])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const remove = async () => {
    if (busy || !onDelete) return
    setBusy(true)
    try { await onDelete(); close() } catch (e) { setBusy(false); setErr(i18n.t('modalsClient:common.saveFailed', { error: e.message || i18n.t('modalsClient:common.tryAgain') })) }
  }

  const submit = async () => {
    if (!form.name.trim()) { setErr(i18n.t('modalsClient:common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      // Edit → patch just the fields this quick form owns; create → the full
      // web insert payload (defaults for the fields we don't collect yet).
      const payload = isEdit
        ? { name: form.name.trim(), phone: form.phone.trim() || null }
        : {
          name: form.name.trim(),
          status: 'active', status_meta: 'active', status_id: null,
          project_id: null, group_id: null, sessions: 0, price_per_session: 0,
          billing_mode: 'package', meeting_type_id: null, price_overridden: false,
          total_override: null, has_custom_price: false, recurring_day: null, recurring_time: null,
          left_mid_process: false, phone: form.phone.trim() || null, email: null,
          address: null, birth_date: null, notes: null, notes_updated_at: null,
        }
      await onSave(payload)
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsClient:common.saveFailed', { error: e.message || i18n.t('modalsClient:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={i18n.t(isEdit ? 'modalsClient:editClient.title' : 'modalsClient:addClient.titleLabel')}>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.name')}</Text>
        <TextInput
          style={[styles.input, err && !form.name.trim() && styles.inputErr]}
          value={form.name}
          onChangeText={(v) => { set('name', v); if (err) setErr('') }}
          placeholderTextColor={colors.textFaint}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsClient:common.phone')}</Text>
        <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder={i18n.t('modalsClient:common.phonePlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="phone-pad" />
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
