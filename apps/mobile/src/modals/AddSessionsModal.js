import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { isr } from '@simplicity/core'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add meetings to a client's quota in one step — the mobile twin of web's
// AddSessionsModal. Selling another block otherwise meant opening the edit
// sheet, unfolding billing and editing "נקבעו".
//
// It states what it does to the money BEFORE saving, because this raises what
// the client owes, and it never records a payment: money in is its own action
// ("קיבלתי תשלום") and folding the two together would make an unpaid renewal
// look settled.
const T = (k, o) => i18n.t(`clients:addSessions.${k}`, o)

export default function AddSessionsModal({ open, onClose, onSave, client }) {
  const [count, setCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setCount(''); setErr(''); setBusy(false) } }, [open])

  const n = Math.trunc(Number(count) || 0)
  const current = Number(client?.sessions) || 0
  const price = Number(client?.price_per_session) || 0
  const perSession = client?.billing_mode === 'per_session'
  // A manual total wins over sessions × price in both modes — that is exactly
  // when adding meetings moves the count and nothing else.
  const overridden = client?.total_override != null && client?.total_override !== ''

  const close = () => { setCount(''); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (busy) return
    if (!(n > 0)) { setErr(T('countRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(current + n)
      close()
    } catch {
      setBusy(false)
      setErr(T('saveFailed'))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={T('title')}>
      <View style={styles.field}>
        <Text style={styles.label}>{T('howMany')}</Text>
        <TextInput
          style={styles.input}
          value={count}
          onChangeText={(v) => { setCount(v); if (err) setErr('') }}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textFaint}
        />
      </View>

      {n > 0 ? (
        <View style={styles.preview}>
          <Text style={styles.previewLine}>{T('previewCount', { from: current, to: current + n })}</Text>
          <Text style={styles.previewLine}>
            {perSession
              ? T('previewPerSession')
              : overridden
                ? T('previewOverridden')
                : T('previewMoney', { n, price: isr(price), amount: isr(n * price) })}
          </Text>
        </View>
      ) : null}

      <Text style={styles.hint}>{T('paymentSeparate')}</Text>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={close} disabled={busy}>
          <Text style={styles.cancelText}>{i18n.t('clients:inline.cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('clients:inline.saving') : i18n.t('clients:inline.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  preview: { backgroundColor: colors.fill, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  previewLine: { fontSize: 12.5, color: colors.textSub, textAlign: 'center' },
  hint: { fontSize: 11.5, lineHeight: 17, color: colors.textSub },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})
