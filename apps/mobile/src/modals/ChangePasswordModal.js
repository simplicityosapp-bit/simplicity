import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { checkPasswordStrength } from '@simplicity/core'
import Sheet from '../components/Sheet'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { supabase } from '../lib/supabase'
import { translateAuthError } from '../lib/authErrors'
import { showToast } from '../lib/toast'
import { useDiscardGuard } from '../lib/discardGuard'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`auth:${k}`, o)

/* Change the signed-in user's password — port of web's UpdatePasswordScreen,
   which doubles there as "change password". The phone had no way to do it:
   its reset link opens the web page, and nothing in Settings touched the
   password at all.

   Same rules as web and as signup (checkPasswordStrength from core), and the
   same placement of complaints: the rule is on screen from the start, the
   mismatch only once there is something to compare. */
export default function ChangePasswordModal({ open, onClose }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [pwBlurred, setPwBlurred] = useState(false)
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPassword(''); setConfirm(''); setShow(false); setPwBlurred(false); setConfirmTouched(false); setError(''); setBusy(false)
  }, [open])

  const pwIssue = checkPasswordStrength(password)
  const showPwIssue = pwBlurred && password.length > 0 && !!pwIssue
  const showMismatch = confirmTouched && password !== confirm
  const requestClose = useDiscardGuard(!busy && !!(password || confirm), onClose)

  const submit = async () => {
    setError('')
    if (pwIssue) { setPwBlurred(true); return }
    if (password !== confirm) { setConfirmTouched(true); return }
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) { setError(translateAuthError(err.message)); return }
      showToast(t('update.doneTitle'))
      onClose()
    } catch (e) {
      setError(translateAuthError(e?.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={requestClose} title={t('update.title')}>
      <Text style={styles.sub}>{t('update.subtitle')}</Text>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

      <View style={styles.field}>
        <Text style={styles.label}>{t('update.newPasswordLabel')}</Text>
        <View style={styles.pwRow}>
          <TextInput
            style={[styles.input, styles.pwInput, showPwIssue && styles.inputBad]}
            value={password}
            onChangeText={setPassword}
            onBlur={() => setPwBlurred(true)}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            accessibilityLabel={t('update.newPasswordLabel')}
            editable={!busy}
          />
          <Pressable style={styles.toggle} onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityLabel={show ? t('hidePassword') : t('showPassword')}>
            <Text style={styles.toggleText}>{show ? t('hidePassword') : t('showPassword')}</Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, showPwIssue && styles.hintBad]}>
          {showPwIssue ? t(pwIssue === 'tooCommon' ? 'update.pwTooCommon' : 'update.pwTooShort') : t('min8chars')}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('update.confirmLabel')}</Text>
        <TextInput
          style={[styles.input, showMismatch && styles.inputBad]}
          value={confirm}
          onChangeText={setConfirm}
          onBlur={() => { if (confirm.length > 0) setConfirmTouched(true) }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          accessibilityLabel={t('update.confirmLabel')}
          editable={!busy}
        />
        {showMismatch ? <Text style={[styles.hint, styles.hintBad]}>{t('update.mismatch')}</Text> : null}
      </View>

      <Pressable style={[styles.btn, busy && styles.off]} onPress={submit} disabled={busy} accessibilityRole="button">
        {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.btnText}>{t('update.updatePassword')}</Text>}
      </Pressable>
    </Sheet>
  )
}

const styles = themed((c) => ({
  sub: { fontSize: 14, color: c.textSub },
  error: { fontSize: 14, color: c.danger },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', color: c.textSub },
  pwRow: { position: 'relative', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: c.text, backgroundColor: c.card },
  pwInput: { paddingEnd: 84 },
  inputBad: { borderColor: c.danger },
  toggle: { position: 'absolute', end: 8, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 6 },
  toggleText: { color: c.brand, fontSize: 13 },
  hint: { fontSize: 12, color: c.textSub },
  hintBad: { color: c.danger },
  btn: { backgroundColor: c.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: c.onBrand, fontSize: 16, fontWeight: '600' },
  off: { opacity: 0.6 },
}))
