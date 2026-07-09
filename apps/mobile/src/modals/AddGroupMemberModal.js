import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add a client to a group (mirrors web AddGroupMemberModal). availableClients
// should already exclude current members; joined_at defaults to today.
const C = (k, o) => i18n.t(`modalsClient:common.${k}`, o)
const M = (k, o) => i18n.t(`modalsClient:addGroupMember.${k}`, o)

export default function AddGroupMemberModal({ open, onClose, onSave, group, availableClients = [] }) {
  const [clientId, setClientId] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setClientId(''); setErr(''); setBusy(false) } }, [open, group])
  const close = () => { setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!clientId) { setErr(M('clientRequired', { defaultValue: 'יש לבחור לקוח/ה.' })); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        group_id: group.id, client_id: clientId,
        joined_at: new Date().toISOString(), left_at: null,
        total_override: null, has_custom_price: false, package_sessions_override: null, left_mid_process: false,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(C('saveFailed', { error: e.message || C('tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={M('title', { defaultValue: 'הוספת חבר/ה לקבוצה' })}>
      <Select
        label={M('client', { defaultValue: 'לקוח/ה' })}
        value={clientId}
        onChange={(v) => { setClientId(v); if (err) setErr('') }}
        placeholder={M('selectClient', { defaultValue: 'בחר/י לקוח' })}
        options={availableClients.map((c) => ({ value: c.id, label: c.name || '' }))}
      />
      {availableClients.length === 0 ? <Text style={styles.hint}>{M('allMembers', { defaultValue: 'כל הלקוחות שלך כבר חברים בקבוצה.' })}</Text> : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{C('cancel')}</Text></Pressable>
        <Pressable style={[styles.save, (busy || !clientId) && styles.saveOff]} onPress={submit} disabled={busy || !clientId}><Text style={styles.saveText}>{busy ? C('saving') : M('addAction', { defaultValue: 'הוספה' })}</Text></Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.textFaint },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})
