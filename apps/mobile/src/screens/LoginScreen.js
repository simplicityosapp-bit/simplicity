import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import i18n from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { buildConsent } from '../lib/legal'
import { signInWithGoogle } from '../lib/googleSignIn'
import GoogleButton from '../components/GoogleButton'
import Screen from '../components/Screen'
import Card from '../components/Card'
import { colors } from '../theme/theme'

// Strings come from @simplicity/core's shared `auth` namespace — the same source
// the web login/signup screens use, so the two never drift.
const t = (k, o) => i18n.t(k, o)
// Web wraps the policy names in <a1>…</a1> for its <Trans> links; mobile shows the
// plain sentence + a single "read more" link, so strip that markup.
const stripTags = (s) => String(s || '').replace(/<\/?[a-z\d]+>/gi, '')
const LEGAL_URL = 'https://simplicity-os.com/legal'
// The reset link opens the web app's update-password page (same as web's flow).
const RESET_REDIRECT = 'https://simplicity-os.com/update-password'

// Login + signup + password-reset (mirrors web AuthGate: login / signup / reset).
// On success the App-level onAuthStateChange listener swaps to the home screen.
export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [agree, setAgree] = useState(false)       // privacy + DPA + terms (required to sign up)
  const [marketing, setMarketing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gbusy, setGbusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)         // reset email sent

  const goMode = (m) => { setMode(m); setError(''); setSent(false) }

  const onGoogle = async () => {
    setError(''); setGbusy(true)
    try {
      const res = await signInWithGoogle()
      if (res?.error) setError(res.error)
    } catch { setError(t('auth:errors.generic')) } finally { setGbusy(false) }
  }

  const login = async () => {
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
  }

  const signup = async () => {
    if (!agree) { setError(t('auth:signupScreen.mustAccept', { defaultValue: 'יש לאשר את המדיניות ותנאי השימוש.' })); return }
    if (password.length < 8) { setError(t('auth:signupScreen.passwordMin8', { defaultValue: 'הסיסמה צריכה להיות לפחות 8 תווים.' })); return }
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: buildConsent({ marketing }) },
    })
    if (err) {
      const m = String(err.message || '').toLowerCase()
      setError(
        m.includes('registered') || m.includes('already') ? t('auth:errors.alreadyRegistered')
          : m.includes('rate') ? t('auth:errors.rateLimit')
            : m.includes('weak') || m.includes('password') ? t('auth:signupScreen.passwordMin8')
              : t('auth:errors.generic'),
      )
      return
    }
    // No session yet = email confirmation required → show the check-email note.
    if (!data?.session) setSent(true)
  }

  const reset = async () => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: RESET_REDIRECT })
    if (err) { setError(err.message || t('auth:errors.generic')); return }
    setSent(true)
  }

  const onSubmit = async () => {
    setError('')
    if (mode !== 'reset' && (!email.trim() || !password)) { setError(t('auth:fillEmailPassword')); return }
    if (mode === 'reset' && !email.trim()) { setError(t('auth:fillEmailPassword')); return }
    setBusy(true)
    try {
      if (mode === 'login') await login()
      else if (mode === 'signup') await signup()
      else await reset()
    } catch { setError(t('auth:errors.generic')) } finally { setBusy(false) }
  }

  // `auth:reset` is an OBJECT in core (reset.title/sendLink/…), so t('auth:reset')
  // would return i18next's "returned an object" string — use the nested leaves.
  const title = mode === 'signup' ? t('auth:signup') : mode === 'reset' ? t('auth:reset.title') : t('auth:login')
  const cta = mode === 'signup' ? t('auth:signup') : mode === 'reset' ? t('auth:reset.sendLink') : t('auth:login')

  // Reset / signup "check your email" confirmation. Reset uses distinct copy —
  // it doesn't ask the user to confirm their email, just that a link was sent.
  if (sent) {
    const isReset = mode === 'reset'
    const sentTitle = isReset ? t('auth:reset.sentTitle') : t('auth:signupScreen.checkEmailTitle')
    const sentBody = isReset
      ? stripTags(t('auth:reset.sentBody', { email: email.trim() }))
      : t('auth:signupScreen.sentBody', { email: email.trim() })
    return (
      <Screen name="login">
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <Card contentStyle={styles.wrap}>
            <Text style={styles.brand}>Simplicity</Text>
            <Text style={styles.title}>{sentTitle}</Text>
            <Text style={styles.foot}>{sentBody}</Text>
            <Pressable style={styles.btn} onPress={() => goMode('login')}><Text style={styles.btnText}>{t('auth:backToLogin')}</Text></Pressable>
          </Card>
        </ScrollView>
      </Screen>
    )
  }

  return (
    <Screen name="login">
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Card contentStyle={styles.wrap}>
          <Text style={styles.brand}>Simplicity</Text>
          <Text style={styles.title}>{title}</Text>

          <TextInput
            style={styles.input} placeholder="Email" placeholderTextColor={colors.textFaint}
            autoCapitalize="none" keyboardType="email-address" autoComplete="email"
            value={email} onChangeText={setEmail} editable={!busy}
          />

          {mode !== 'reset' ? (
            <View style={styles.pwRow}>
              <TextInput
                style={[styles.input, styles.pwInput]} placeholder="Password" placeholderTextColor={colors.textFaint}
                secureTextEntry={!show} autoCapitalize="none" value={password} onChangeText={setPassword} editable={!busy}
              />
              <Pressable onPress={() => setShow((s) => !s)} accessibilityLabel={show ? t('auth:hidePassword') : t('auth:showPassword')} hitSlop={8}>
                <Text style={styles.pwToggle}>{show ? t('auth:hidePassword') : t('auth:showPassword')}</Text>
              </Pressable>
            </View>
          ) : null}

          {mode === 'login' ? (
            <Pressable onPress={() => goMode('reset')} hitSlop={6} style={styles.forgotWrap}>
              <Text style={styles.link}>{t('auth:forgotPassword', { defaultValue: 'שכחת סיסמה?' })}</Text>
            </Pressable>
          ) : null}

          {mode === 'signup' ? (
            <>
              <ConsentRow checked={agree} onToggle={() => setAgree((v) => !v)}
                label={`${stripTags(t('auth:signupScreen.consentPolicies'))} · ${stripTags(t('auth:signupScreen.consentTerms'))}`}
                onLink={() => Linking.openURL(LEGAL_URL).catch(() => {})} />
              <ConsentRow checked={marketing} onToggle={() => setMarketing((v) => !v)}
                label={t('auth:signupScreen.consentMarketing', { defaultValue: 'אני מסכים/ה לקבל עדכונים שיווקיים (ניתן לביטול בכל עת)' })} />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.btn, (busy || gbusy) && styles.btnBusy]} onPress={onSubmit} disabled={busy || gbusy}>
            {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.btnText}>{cta}</Text>}
          </Pressable>

          {mode !== 'reset' ? (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('auth:or')}</Text>
                <View style={styles.dividerLine} />
              </View>
              <GoogleButton label={t('auth:googleLogin')} onPress={onGoogle} busy={gbusy} disabled={busy} />
            </>
          ) : null}

          {mode === 'login' ? (
            <Pressable onPress={() => goMode('signup')} hitSlop={6}>
              <Text style={styles.foot}>{t('auth:noAccount')} <Text style={styles.link}>{t('auth:signup')}</Text></Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => goMode('login')} hitSlop={6}>
              <Text style={styles.foot}>{mode === 'signup' ? t('auth:signupScreen.haveAccount', { defaultValue: 'כבר יש לך חשבון?' }) : ''} <Text style={styles.link}>{t('auth:backToLogin', { defaultValue: 'חזרה להתחברות' })}</Text></Text>
            </Pressable>
          )}
        </Card>
      </ScrollView>
    </Screen>
  )
}

function ConsentRow({ checked, onToggle, label, onLink }) {
  return (
    <Pressable style={styles.consentRow} onPress={onToggle} hitSlop={4}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked ? <Check size={13} strokeWidth={2.6} color={colors.onBrand} /> : null}</View>
      <Text style={styles.consentText}>
        {label}{onLink ? <Text> · <Text style={styles.link} onPress={onLink}>{i18n.t('auth:signupScreen.readMore', { defaultValue: 'קראו כאן' })}</Text></Text> : null}
      </Text>
    </Pressable>
  )
}

const BRAND = colors.brand
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  wrap: { gap: 14 },
  brand: { fontSize: 15, letterSpacing: 1, color: BRAND, textAlign: 'center', fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 13, fontSize: 16, color: colors.text, backgroundColor: colors.card,
  },
  pwRow: { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingEnd: 84 },
  pwToggle: { position: 'absolute', end: 14, top: -10, color: BRAND, fontSize: 13 },
  forgotWrap: { alignItems: 'flex-end', marginTop: -6 },
  link: { color: BRAND, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  btn: { backgroundColor: BRAND, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnBusy: { opacity: 0.7 },
  btnText: { color: colors.onBrand, fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textFaint, fontSize: 13 },
  foot: { textAlign: 'center', color: colors.textSub, fontSize: 14, marginTop: 8 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: BRAND, borderColor: BRAND },
  consentText: { flex: 1, fontSize: 13, color: colors.textSub, lineHeight: 18 },
})
