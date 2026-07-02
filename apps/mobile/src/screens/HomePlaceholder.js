import { View, Text, Pressable, StyleSheet } from 'react-native'
import i18n from '../lib/i18n'
import { supabase } from '../lib/supabase'

// Minimal post-login landing — just proves the session gate + sign-out round-trip.
// The real home screen (ported from apps/web homeData) comes in a later wave.
export default function HomePlaceholder({ session }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.hi}>👋</Text>
      <Text style={styles.title}>{i18n.t('auth:login')} ✓</Text>
      <Text style={styles.email}>{session?.user?.email || ''}</Text>
      <Pressable style={styles.btn} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.btnText}>{i18n.t('nav:logout')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#fbf7f2' },
  hi: { fontSize: 40 },
  title: { fontSize: 22, fontWeight: '600', color: '#3a342e' },
  email: { fontSize: 15, color: '#7c6f63' },
  btn: { marginTop: 16, borderWidth: 1, borderColor: '#e4dccf', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, backgroundColor: '#fff' },
  btnText: { color: '#C97B5E', fontSize: 15, fontWeight: '600' },
})
