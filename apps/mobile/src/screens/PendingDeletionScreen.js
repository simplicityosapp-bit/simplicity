import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertTriangle } from 'lucide-react-native'
import { fmtShortDate } from '@simplicity/core'
import i18n from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { usePreferences } from '../lib/preferences'
import Screen from '../components/Screen'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Shown INSTEAD of the app while an account-deletion request is within its grace
// window (mirrors the web pending-deletion gate): the scheduled date + a cancel
// (clears the request → back to normal) + sign out.
export default function PendingDeletionScreen() {
  const insets = useSafeAreaInsets()
  const { prefs, update } = usePreferences()
  const scheduled = prefs?.accountDeletion?.scheduled_for
  const dateStr = scheduled ? fmtShortDate(scheduled) : ''
  // Reuse the same translated keys web's AccountDeletionPending uses
  // (components:deletion.*) so en/es/fr users don't get Hebrew fallbacks. Body =
  // lead + deadline; strip the <0></0> markup i18next carries for web's <Trans>.
  const body = `${i18n.t('components:deletion.bodyLead', { regret: i18n.t('components:deletion.regret') })} ${i18n.t('components:deletion.bodyDeadline', { date: dateStr }).replace(/<\/?\d>/g, '')}`
  /* Cancelling is strict (see update): it lifts the lock only once the server
     has the change. Before, a failed write lifted it here while the deletion
     stayed scheduled — and the lock came back on the next launch, or the
     account was deleted. Busy and the error line mirror web's screen. */
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const cancelDeletion = async () => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await update({ accountDeletion: null }, { strict: true })
    } catch {
      setErr(i18n.t('components:deletion.cancelFailed', { tryAgain: i18n.t('common:tryAgain') }))
      setBusy(false)
    }
  }
  return (
    <Screen name="login">
      <View style={[styles.wrap, { paddingTop: insets.top + 48 }]}>
        <Card contentStyle={styles.card}>
          <AlertTriangle size={40} strokeWidth={1.6} color={colors.danger} />
          <Text style={styles.title}>{i18n.t('components:deletion.title', { defaultValue: 'החשבון מתוזמן למחיקה' })}</Text>
          <Text style={styles.body}>{body}</Text>
          <Pressable style={[styles.cancelBtn, busy && styles.busy]} onPress={cancelDeletion} disabled={busy}>
            <Text style={styles.cancelText}>{i18n.t('components:deletion.cancel', { defaultValue: 'בטל מחיקה ושחזר את החשבון' })}</Text>
          </Pressable>
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Pressable onPress={() => supabase.auth.signOut()} hitSlop={8}>
            <Text style={styles.signOut}>{i18n.t('nav:signOut', { defaultValue: 'התנתקות' })}</Text>
          </Pressable>
        </Card>
      </View>
    </Screen>
  )
}

const styles = themed((c, t) => ({
  wrap: { flex: 1, paddingHorizontal: 24, justifyContent: 'flex-start' },
  card: { alignItems: 'center', gap: 14, paddingVertical: 28, paddingHorizontal: 22 },
  title: { fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center' },
  body: { fontSize: 14, color: c.textSub, textAlign: 'center', lineHeight: 20 },
  cancelBtn: { backgroundColor: c.brand, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', alignSelf: 'stretch', marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '600', color: c.onBrand },
  busy: { opacity: 0.6 },
  error: { fontSize: 13, color: c.danger, textAlign: 'center' },
  signOut: { fontSize: 14, color: c.danger, marginTop: 4 },
}))
