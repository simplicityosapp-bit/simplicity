import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { ACCOUNT_DELETION_GRACE_DAYS } from '../lib/account'

// Two-step permanent-delete confirm (mirrors web DeleteAccountModal): a warning,
// then a type-the-phrase gate. onConfirm records the deletion request (30-day
// grace); the app then gates to the pending-deletion screen.
const M = (k, o) => i18n.t(`modalsSystem:deleteAccount.${k}`, o)
const cancelLabel = () => i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })

export default function DeleteAccountModal({ open, onClose, onConfirm }) {
  const [step, setStep] = useState(1)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const phrase = M('confirmPhrase', { defaultValue: 'מחיקת חשבון' })
  useEffect(() => { if (open) { setStep(1); setTyped(''); setBusy(false); setErr('') } }, [open])
  const close = () => { if (busy) return; onClose() }

  const confirm = async () => {
    if (typed.trim() !== phrase) { setErr(M('typeVerb', { defaultValue: 'הקלד/י את הביטוי' })); return }
    setBusy(true); setErr('')
    try { await onConfirm(); onClose() } catch (e) { setBusy(false); setErr(e?.message || i18n.t('modalsData:common.tryAgain', { defaultValue: 'נסה/י שוב' })) }
  }

  return (
    <Sheet open={open} onClose={close} title={M('title', { defaultValue: 'מחיקת חשבון לצמיתות' })}>
      {step === 1 ? (
        <>
          <Text style={styles.warn}>{i18n.t('settings:danger.deleteHint', { defaultValue: 'מוחק את החשבון כולו — כולל ההתחברות — לא רק את הנתונים. תקופת חסד של 30 יום לביטול.' })}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{cancelLabel()}</Text></Pressable>
            <Pressable style={styles.danger} onPress={() => setStep(2)}><Text style={styles.dangerText}>{M('continue', { defaultValue: 'המשך למחיקה' })}</Text></Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.warn}>{M('step2', { type: M('typeVerb', { defaultValue: 'הקלד/י' }), phrase, days: ACCOUNT_DELETION_GRACE_DAYS, defaultValue: `כדי לאשר, הקלד/י «${phrase}». לאחר מכן יתחיל מניין ${ACCOUNT_DELETION_GRACE_DAYS} הימים.` }).replace(/<\/?\d>/g, '')}</Text>
          <Text style={styles.label}>{M('inputLabel', { defaultValue: 'הקלד/י:' })} {phrase}</Text>
          <TextInput style={[styles.input, err && styles.inputErr]} value={typed} onChangeText={(v) => { setTyped(v); if (err) setErr('') }} placeholder={phrase} placeholderTextColor={colors.textFaint} autoCapitalize="none" />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{cancelLabel()}</Text></Pressable>
            <Pressable style={[styles.danger, (busy || typed.trim() !== phrase) && styles.off]} onPress={confirm} disabled={busy || typed.trim() !== phrase}>
              <Text style={styles.dangerText}>{busy ? M('deleting', { defaultValue: 'מסמן למחיקה…' }) : M('confirmBtn', { defaultValue: 'מחק את החשבון' })}</Text>
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  warn: { fontSize: 13, color: colors.textSub, lineHeight: 19 },
  label: { fontSize: 13, color: colors.textSub, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  danger: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center' },
  dangerText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
  off: { opacity: 0.5 },
})
