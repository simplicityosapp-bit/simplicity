import { useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { clientBalance, statusMetaOf, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useClientsList } from '../hooks/useClientsList'

const SORDER = { active: 0, wandering: 1, no_status: 2, past: 3 }
const STATUS_COLOR = { active: colors.positive, wandering: '#D9A566', past: '#b3a99c', no_status: '#cbb9a8' }

// Real Clients screen. Read-only list — name + status + outstanding balance
// (core clientBalance), over the per-screen photo (Warm Precision theme).
export default function ClientsScreen() {
  const { clients, transactions, sessions, members, groups, loading, error, refetch } = useClientsList()

  const rows = useMemo(
    () => clients
      .map((c) => ({ c, meta: statusMetaOf(c), balance: clientBalance(c, transactions, sessions, members, groups).balance }))
      .sort((a, b) => (SORDER[a.meta] ?? 2) - (SORDER[b.meta] ?? 2)),
    [clients, transactions, sessions, members, groups],
  )

  return (
    <Screen name="clients">
      <ScreenHeader title={i18n.t('clients:title', { defaultValue: 'לקוחות' })} />

      {loading && !clients.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {rows.length ? (
            <Card padded={false}>
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
            </Card>
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  status: { fontSize: 12, color: colors.textFaint },
  balance: { fontSize: 14, fontWeight: '600', color: colors.brand },
})
