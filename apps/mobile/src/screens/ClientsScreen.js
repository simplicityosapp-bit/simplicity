import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { clientBalance, statusMetaOf, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import AddClientModal from '../modals/AddClientModal'
import { colors } from '../theme/theme'
import { useClientsList } from '../hooks/useClientsList'

const SORDER = { active: 0, wandering: 1, no_status: 2, past: 3 }
const STATUS_COLOR = { active: colors.positive, wandering: '#D9A566', past: '#b3a99c', no_status: '#cbb9a8' }
const TABS = ['all', 'active', 'wandering', 'past']

// Clients screen — name + status + sessions/paid/balance (core clientBalance),
// filterable by status tab, over the per-screen photo. Tap a row to edit.
export default function ClientsScreen() {
  const { clients, transactions, sessions, members, groups, loading, error, refetch, updateClient, deleteClient } = useClientsList()
  const [editing, setEditing] = useState(null)
  const [tab, setTab] = useState('all')

  const rows = useMemo(
    () => clients
      .map((c) => ({ c, meta: statusMetaOf(c), bal: clientBalance(c, transactions, sessions, members, groups) }))
      .sort((a, b) => (SORDER[a.meta] ?? 2) - (SORDER[b.meta] ?? 2)),
    [clients, transactions, sessions, members, groups],
  )
  const shown = useMemo(() => (tab === 'all' ? rows : rows.filter((r) => r.meta === tab)), [rows, tab])
  const tabLabel = (t) => (t === 'all' ? i18n.t('clients:filter.all', { defaultValue: 'הכל' }) : i18n.t(`clients:status.${t}`))
  const tabCount = (t) => (t === 'all' ? rows.length : rows.filter((r) => r.meta === t).length)

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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {TABS.map((t) => {
                const on = tab === t
                return (
                  <Pressable key={t} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(t)}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{tabLabel(t)} {tabCount(t)}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : null}
          {shown.length ? (
            <Card padded={false}>
              {shown.map(({ c, meta, bal }, i) => {
                const stats = []
                if (bal.hasPersonal && bal.personalQuota > 0) stats.push(`${bal.personalDone}/${bal.personalQuota} ${i18n.t('clients:card.sessions')}`)
                if (bal.paid > 0) stats.push(`${i18n.t('clients:card.paid')} ${isr(bal.paid)}`)
                return (
                  <Pressable key={c.id} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => setEditing(c)}>
                    <View style={[styles.dot, { backgroundColor: STATUS_COLOR[meta] || '#cbb9a8' }]} />
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>{c.name || ''}</Text>
                      <Text style={styles.status} numberOfLines={1}>
                        {i18n.t(`clients:status.${meta}`, { defaultValue: meta })}{stats.length ? ` · ${stats.join(' · ')}` : ''}
                      </Text>
                    </View>
                    {bal.balance > 0 ? <Text style={styles.balance}>{isr(bal.balance)}</Text> : null}
                  </Pressable>
                )
              })}
            </Card>
          ) : (
            <Text style={styles.empty}>{rows.length ? i18n.t('clients:empty.noSearchResults', { defaultValue: '—' }) : i18n.t('clients:empty.firstClient', { defaultValue: '—' })}</Text>
          )}
        </ScrollView>
      )}

      <AddClientModal
        open={!!editing}
        client={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => updateClient(editing.id, patch)}
        onDelete={() => deleteClient(editing.id)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  tabs: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 13, color: colors.textSub },
  tabTextOn: { color: colors.onBrand, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  status: { fontSize: 12, color: colors.textFaint },
  balance: { fontSize: 14, fontWeight: '600', color: colors.brand },
})
