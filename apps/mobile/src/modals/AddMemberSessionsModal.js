import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { isr, renewedCard } from '@simplicity/core'
import Sheet from '../components/Sheet'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`modalsClient:memberSessions.${k}`, o)

/* Sell one member another card of meetings (web AddMemberSessionsModal) —
   the yoga model, where a group runs on and each student buys ten classes at
   a time. The member's own quota and the dues that come with it move
   together, priced off the group's package, and the sheet says both before
   saving: raising what someone owes is not a thing to do silently. The
   phone had no way to do this at all. */
export default function AddMemberSessionsModal({ open, onClose, onSave, memberName = '', groupName = '', groupColor = '', unitPrice = 0, currentQuota = 0, currentTotal = 0 }) {
  const [count, setCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { if (open) { setCount(''); setBusy(false); setErr('') } }, [open])

  // core renewedCard: the preview and the written row can never be two sums.
  const next = renewedCard({ currentQuota, currentTotal, unitPrice, count })
  const n = next.count
  const added = Math.round((next.total - currentTotal) * 100) / 100

  const submit = async () => {
    if (busy) return
    if (!(n > 0)) { setErr(t('countRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(next)
      onClose()
    } catch {
      setBusy(false)
      setErr(t('saveFailed'))
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      {memberName || groupName ? (
        <View style={styles.subRow}>
          <View style={[styles.dot, { backgroundColor: groupColor || colors.textSub }]} />
          <Text style={styles.sub}>{[memberName, groupName].filter(Boolean).join(' · ')}</Text>
        </View>
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label}>{t('howMany')}</Text>
        <TextInput style={styles.input} value={count} onChangeText={(v) => { setCount(v.replace(/[^\d]/g, '')); if (err) setErr('') }} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textFaint} accessibilityLabel={t('howMany')} />
      </View>
      {n > 0 ? (
        <View style={styles.preview}>
          <Text style={styles.previewLine}>{t('previewQuota', { from: currentQuota, to: next.quota })}</Text>
          <Text style={styles.previewLine}>
            {unitPrice > 0 ? t('previewMoney', { n, price: isr(unitPrice), amount: isr(added), name: memberName }) : t('previewFree')}
          </Text>
        </View>
      ) : null}
      <Text style={styles.hint}>{t('note')}</Text>
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={onClose} disabled={busy}><Text style={styles.cancelText}>{i18n.t('modalsClient:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.off]} onPress={submit} disabled={busy} accessibilityRole="button">
          <Text style={styles.saveText}>{busy ? i18n.t('modalsClient:common.saving') : i18n.t('modalsClient:common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c) => ({
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  sub: { fontSize: 14, color: c.textSub },
  field: { gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  preview: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: c.cardFlat },
  previewLine: { fontSize: 13, color: c.text },
  hint: { fontSize: 12, color: c.textSub, lineHeight: 17 },
  error: { fontSize: 13, color: c.danger },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
  off: { opacity: 0.5 },
}))
