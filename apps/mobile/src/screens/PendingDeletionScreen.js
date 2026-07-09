import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertTriangle } from 'lucide-react-native'
import { fmtShortDate } from '@simplicity/core'
import i18n from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { usePreferences } from '../lib/preferences'
import Screen from '../components/Screen'
import Card from '../components/Card'
import { colors } from '../theme/theme'

// Shown INSTEAD of the app while an account-deletion request is within its grace
// window (mirrors the web pending-deletion gate): the scheduled date + a cancel
// (clears the request → back to normal) + sign out.
export default function PendingDeletionScreen() {
  const insets = useSafeAreaInsets()
  const { prefs, update } = usePreferences()
  const scheduled = prefs?.accountDeletion?.scheduled_for
  const dateStr = scheduled ? fmtShortDate(scheduled) : ''
  return (
    <Screen name="login">
      <View style={[styles.wrap, { paddingTop: insets.top + 48 }]}>
        <Card contentStyle={styles.card}>
          <AlertTriangle size={40} strokeWidth={1.6} color={colors.danger} />
          <Text style={styles.title}>{i18n.t('modalsSystem:deleteAccount.pendingTitle', { defaultValue: 'החשבון מסומן למחיקה' })}</Text>
          <Text style={styles.body}>{i18n.t('modalsSystem:deleteAccount.pendingBody', { date: dateStr, defaultValue: `החשבון יימחק לצמיתות ב-${dateStr}. אפשר לבטל עד אז ולהמשיך להשתמש כרגיל.` })}</Text>
          <Pressable style={styles.cancelBtn} onPress={() => update({ accountDeletion: null })}>
            <Text style={styles.cancelText}>{i18n.t('modalsSystem:deleteAccount.cancelRequest', { defaultValue: 'ביטול המחיקה והמשך שימוש' })}</Text>
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()} hitSlop={8}>
            <Text style={styles.signOut}>{i18n.t('nav:signOut', { defaultValue: 'התנתקות' })}</Text>
          </Pressable>
        </Card>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, justifyContent: 'flex-start' },
  card: { alignItems: 'center', gap: 14, paddingVertical: 28, paddingHorizontal: 22 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textSub, textAlign: 'center', lineHeight: 20 },
  cancelBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', alignSelf: 'stretch', marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
  signOut: { fontSize: 14, color: colors.danger, marginTop: 4 },
})
