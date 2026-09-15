import { useState } from 'react'
import { View, ScrollView, ActivityIndicator, Linking, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import Screen from '../components/Screen'
import Card from '../components/Card'
import { supabase } from '../lib/supabase'
import { buildReacceptance } from '../lib/legal'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`auth:policyUpdate.${k}`, o)
const DOCS = ['privacy', 'dpa', 'terms']
const docUrl = (doc) => `https://simplicity-os.com/legal?tab=${doc}`

/* ════════════════════════════════════════════════════════════════
   POLICY UPDATE — the blocking re-acceptance gate, on the phone.
   ════════════════════════════════════════════════════════════════
   Port of web's PolicyUpdateModal. Shown by ConsentGate when the privacy
   policy, the DPA or the terms the user accepted are older than the
   current versions (or were never recorded). Each document is agreed to
   separately, as on web; confirming writes the new acceptance to
   user_metadata, the session refreshes and the gate lets go.

   One addition web does not need: a way out. On web the tab can be closed;
   here the gate is the whole app, so signing out is offered below it.
   ════════════════════════════════════════════════════════════════ */
export default function PolicyUpdateScreen() {
  const insets = useSafeAreaInsets()
  const [agreed, setAgreed] = useState({ privacy: false, dpa: false, terms: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const all = DOCS.every((d) => agreed[d])

  const confirm = async () => {
    if (!all || busy) return
    setBusy(true)
    setError('')
    try {
      const { error: e } = await supabase.auth.updateUser({ data: buildReacceptance() })
      if (e) throw e
      // success → USER_UPDATED refreshes the session → ConsentGate releases.
    } catch {
      setError(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen name="login">
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Card contentStyle={styles.wrap}>
          <Text style={styles.brand}>Simplicity</Text>
          <Text style={styles.title}>{t('title')}</Text>
          <Text style={styles.sub}>{t('sub')}</Text>

          {DOCS.map((doc) => (
            <AgreeRow
              key={doc}
              checked={agreed[doc]}
              onToggle={() => setAgreed((a) => ({ ...a, [doc]: !a[doc] }))}
              prefix={t('agreePrefix')}
              doc={t(`docs.${doc}`)}
              onOpen={() => Linking.openURL(docUrl(doc)).catch(() => {})}
            />
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.btn, (!all || busy) && styles.btnOff]} onPress={confirm} disabled={!all || busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.btnText}>{t('confirm')}</Text>}
          </Pressable>

          <Pressable onPress={() => { supabase.auth.signOut().catch(() => {}) }} hitSlop={6} accessibilityRole="button">
            <Text style={styles.foot}>{i18n.t('nav:signOut', { defaultValue: 'התנתקות' })}</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  )
}

function AgreeRow({ checked, onToggle, prefix, doc, onOpen }) {
  // Same mirror LoginScreen's consent rows use while the engine is not RTL yet.
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
  return (
    <Pressable
      style={[styles.row, flip && styles.rowFlip]}
      onPress={onToggle}
      hitSlop={4}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${prefix}${doc}`}
    >
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={13} strokeWidth={2.6} color={colors.onBrand} /> : null}</View>
      <Text style={styles.rowText}>
        {prefix}<Text style={styles.link} onPress={onOpen}>{doc}</Text>
      </Text>
    </Pressable>
  )
}

const styles = themed((c) => ({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  wrap: { gap: 14 },
  brand: { fontSize: 15, letterSpacing: 1, color: c.brand, textAlign: 'center', fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '600', color: c.text, textAlign: 'center' },
  sub: { fontSize: 14, color: c.textSub, textAlign: 'center', lineHeight: 20, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  rowFlip: { flexDirection: 'row-reverse' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: c.brand, borderColor: c.brand },
  rowText: { flex: 1, fontSize: 14, color: c.text, lineHeight: 20 },
  link: { color: c.brand, fontWeight: '600' },
  error: { color: c.danger, fontSize: 14, textAlign: 'center' },
  btn: { backgroundColor: c.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  btnOff: { opacity: 0.5 },
  btnText: { color: c.onBrand, fontSize: 16, fontWeight: '600' },
  foot: { textAlign: 'center', color: c.textSub, fontSize: 14, marginTop: 4 },
}))
