import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { homeChips, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useHomeData } from '../hooks/useHomeData'

// First real home screen — greeting + the net + clients chips, computed by the
// SHARED core `homeChips` (same engine the web home uses). Built incrementally:
// today's-agenda chip, attention rows, reminders etc. land in later increments.
export default function HomeScreen({ session }) {
  const { clients, transactions, loading, error, refetch } = useHomeData()

  const chips = useMemo(
    () => homeChips(new Date(), { clients, transactions }),
    [clients, transactions],
  )
  const netStr = isr(chips.net)
  const email = session?.user?.email || ''

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={BRAND} />}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>Simplicity</Text>
        <Pressable onPress={() => supabase.auth.signOut()} hitSlop={8}>
          <Text style={styles.logout}>{i18n.t('nav:logout')}</Text>
        </Pressable>
      </View>

      {email ? <Text style={styles.email}>{email}</Text> : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={refetch}><Text style={styles.retry}>↻</Text></Pressable>
        </View>
      ) : null}

      <View style={styles.chips}>
        <Chip value={loading ? '··' : netStr} label={i18n.t('home:widgets.chips.net')} long={netStr.length >= 8} />
        <Chip value={loading ? '··' : String(chips.activeClients)} label={i18n.t('home:widgets.chips.clients')} />
      </View>
    </ScrollView>
  )
}

function Chip({ value, label, long }) {
  return (
    <View style={styles.chip}>
      <Text style={[styles.chipNum, long && styles.chipNumLong]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.chipLbl}>{label}</Text>
    </View>
  )
}

const BRAND = '#C97B5E'
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fbf7f2' },
  content: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 40, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 16, letterSpacing: 1, color: BRAND, fontWeight: '600' },
  logout: { color: '#7c6f63', fontSize: 14 },
  email: { color: '#a89f95', fontSize: 13, marginBottom: 12 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fbeae7', borderRadius: 12, padding: 12, marginBottom: 8 },
  errorText: { color: '#c0392b', fontSize: 13, flex: 1 },
  retry: { color: '#c0392b', fontSize: 18 },
  chips: { flexDirection: 'row', gap: 12 },
  chip: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da',
    paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 6,
  },
  chipNum: { fontSize: 28, fontWeight: '600', color: '#3a342e' },
  chipNumLong: { fontSize: 22 },
  chipLbl: { fontSize: 14, color: '#7c6f63' },
})
