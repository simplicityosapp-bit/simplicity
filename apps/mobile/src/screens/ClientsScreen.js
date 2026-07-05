import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { clientBalance, statusMetaOf, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import { useClientsList } from '../hooks/useClientsList'

const SORDER = { active: 0, wandering: 1, no_status: 2, past: 3 }
const STATUS_COLOR = { active: '#8BA888', wandering: '#D9A566', past: '#b3a99c', no_status: '#cbb9a8' }

// Real Clients screen (replaces the stub). Read-only list for now — name +
// status + outstanding balance (core clientBalance). A client detail screen is
// a later increment.
export default function ClientsScreen() {
  const nav = useNavigation()
  const { clients, transactions, sessions, members, groups, loading, error, refetch } = useClientsList()

  const rows = useMemo(
    () => clients
      .map((c) => ({ c, meta: statusMetaOf(c), balance: clientBalance(c, transactions, sessions, members, groups).balance }))
      .sort((a, b) => (SORDER[a.meta] ?? 2) - (SORDER[b.meta] ?? 2)),
    [clients, transactions, sessions, members, groups],
  )

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        {nav.canGoBack() ? <Pressable onPress={() => nav.goBack()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable> : <View style={styles.spacer} />}
        <Text style={styles.title}>{i18n.t('clients:title', { defaultValue: 'לקוחות' })}</Text>
        <View style={styles.spacer} />
      </View>

      {loading && !clients.length ? (
        <View style={styles.center}><ActivityIndicator color="#C97B5E" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#C97B5E" />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {rows.length ? (
            <View style={styles.card}>
              {rows.map(({ c, meta, balance }, i) => (
                <View key={c.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <View style={[styles.dot, { backgroundColor: STATUS_COLOR[meta] || '#cbb9a8' }]} />
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>{c.name || ''}</Text>
                    <Text style={styles.status}>{i18n.t(`clients:status.${meta}`, { defaultValue: meta })}</Text>
                  </View>
                  {balance > 0 ? <Text style={styles.balance}>{isr(balance)}</Text> : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const BRAND = '#C97B5E'
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fbf7f2' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  back: { fontSize: 30, color: BRAND, lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '600', color: '#3a342e', flex: 1, textAlign: 'center' },
  spacer: { width: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  error: { color: '#c0392b', fontSize: 13 },
  empty: { color: '#a89f95', fontSize: 14, textAlign: 'center', marginTop: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f2ece1' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: '#3a342e' },
  status: { fontSize: 12, color: '#a89f95' },
  balance: { fontSize: 14, fontWeight: '600', color: '#C97B5E' },
})
