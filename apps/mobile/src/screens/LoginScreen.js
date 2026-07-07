import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import i18n from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { signInWithGoogle, googleAvailable } from '../lib/googleSignIn'
import GoogleButton from '../components/GoogleButton'
import { colors } from '../theme/theme'

// Strings come from @simplicity/core's shared `auth` namespace — the same source
// the web login screen uses, so the two never drift.
const t = (k, o) => i18n.t(k, o)

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gbusy, setGbusy] = useState(false)
  const [error, setError] = useState('')

  const onGoogle = async () => {
    setError('')
    setGbusy(true)
    try {
      const res = await signInWithGoogle()
      // res.cancelled → user dismissed, show nothing. res.ok → the App-level
      // onAuthStateChange listener swaps to the home screen. Otherwise: message.
      if (res?.error) setError(res.error)
    } catch {
      setError(t('auth:errors.generic'))
    } finally {
      setGbusy(false)
    }
  }

  const onSubmit = async () => {
    setError('')
    if (!email.trim() || !password) {
      setError(t('auth:fillEmailPassword'))
      return
    }
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) {
        const m = String(err.message || '').toLowerCase()
        setError(
          m.includes('invalid') ? t('auth:errors.invalidLogin')
            : m.includes('confirm') ? t('auth:errors.emailNotConfirmed')
              : m.includes('rate') ? t('auth:errors.rateLimit')
                : t('auth:errors.generic'),
        )
      }
      // On success the App-level onAuthStateChange listener swaps to the home screen.
    } catch {
      setError(t('auth:errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>Simplicity</Text>
      <Text style={styles.title}>{t('auth:login')}</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />

      <View style={styles.pwRow}>
        <TextInput
          style={[styles.input, styles.pwInput]}
          placeholder="Password"
          placeholderTextColor={colors.textFaint}
          secureTextEntry={!show}
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />
        <Pressable
          onPress={() => setShow((s) => !s)}
          accessibilityLabel={show ? t('auth:hidePassword') : t('auth:showPassword')}
          hitSlop={8}
        >
          <Text style={styles.pwToggle}>{show ? t('auth:hidePassword') : t('auth:showPassword')}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.btn, (busy || gbusy) && styles.btnBusy]} onPress={onSubmit} disabled={busy || gbusy}>
        {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.btnText}>{t('auth:login')}</Text>}
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('auth:or')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <GoogleButton
        label={t('auth:googleLogin')}
        onPress={onGoogle}
        busy={gbusy}
        disabled={busy || !googleAvailable}
      />

      <Text style={styles.foot}>
        {t('auth:noAccount')} {t('auth:signup')}
      </Text>
    </View>
  )
}

const BRAND = colors.brand
const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 14, backgroundColor: colors.bg },
  brand: { fontSize: 15, letterSpacing: 1, color: BRAND, textAlign: 'center', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 13, fontSize: 16, color: colors.text, backgroundColor: colors.card,
  },
  pwRow: { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingEnd: 84 },
  pwToggle: { position: 'absolute', end: 14, top: -10, color: BRAND, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  btn: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnBusy: { opacity: 0.7 },
  btnText: { color: colors.onBrand, fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textFaint, fontSize: 13 },
  foot: { textAlign: 'center', color: colors.textSub, fontSize: 14, marginTop: 8 },
})
