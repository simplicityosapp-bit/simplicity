import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking } from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { Pencil, Trash2, Plus, MessageCircle } from 'lucide-react-native'
import { clientBalance, statusMetaOf, isr, fmtShortDate } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import AddClientModal from '../modals/AddClientModal'
import AddTransactionModal from '../modals/AddTransactionModal'
import { colors } from '../theme/theme'
import { useClientsList } from '../hooks/useClientsList'

const STATUS_COLOR = { active: colors.positive, wandering: '#D9A566', past: '#b3a99c', no_status: '#cbb9a8' }

// Client detail ("תיק לקוח", mirrors web ClientDrawer): status + sessions/paid/
// balance stats + edit / log-payment / WhatsApp actions + recent transactions.
export default function ClientDetailScreen() {
  const route = useRoute()
  const nav = useNavigation()
  const clientId = route.params?.clientId
  const { clients, transactions, sessions, members, groups, loading, updateClient, deleteClient, addTransaction } = useClientsList()
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)

  const client = clients.find((c) => c.id === clientId)
  const bal = useMemo(() => (client ? clientBalance(client, transactions, sessions, members, groups) : null), [client, transactions, sessions, members, groups])
  const meta = client ? statusMetaOf(client) : null
  const clientTx = useMemo(
    () => transactions.filter((t) => t.client_id === clientId && !t.deleted_at).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20),
    [transactions, clientId],
  )

  if (!client) {
    return (
      <Screen name="clients">
        <ScreenHeader title={i18n.t('clients:drawer.title', { defaultValue: 'תיק לקוח' })} />
        <View style={styles.center}>{loading ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.empty}>—</Text>}</View>
      </Screen>
    )
  }

  const del = async () => { try { await deleteClient(clientId) } finally { nav.goBack() } }
  const whatsapp = () => { const p = (client.phone || '').replace(/\D/g, ''); if (p) Linking.openURL(`https://wa.me/${p}`) }

  return (
    <Screen name="clients">
      <ScreenHeader
        title={client.name || i18n.t('clients:drawer.title', { defaultValue: 'תיק לקוח' })}
        right={<Pressable onPress={del} hitSlop={10}><Trash2 size={20} strokeWidth={1.8} color={colors.danger} /></Pressable>}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: STATUS_COLOR[meta] || '#cbb9a8' }]} />
          <Text style={styles.statusText}>{i18n.t(`clients:status.${meta === 'no_status' ? 'noStatus' : meta}`, { defaultValue: '' })}</Text>
          {client.phone ? <Text style={styles.phone}>{client.phone}</Text> : null}
        </View>

        <View style={styles.stats}>
          <Stat label={i18n.t('clients:drawer.sessions', { defaultValue: 'פגישות' })} value={bal.hasPersonal ? `${bal.personalDone}/${bal.personalQuota}` : '—'} />
          <Stat label={i18n.t('clients:drawer.paid', { defaultValue: 'שולם' })} value={isr(bal.paid)} />
          <Stat label={i18n.t('clients:drawer.balance', { defaultValue: 'יתרה' })} value={isr(bal.balance)} accent={bal.balance > 0} />
        </View>

        <View style={styles.actions}>
          <Action Icon={Pencil} label={i18n.t('clients:drawer.edit', { defaultValue: 'ערוך' })} onPress={() => setEditing(true)} />
          <Action Icon={Plus} label={i18n.t('clients:drawer.paid', { defaultValue: 'שולם' })} onPress={() => setPaying(true)} />
          {client.phone ? <Action Icon={MessageCircle} label="WhatsApp" onPress={whatsapp} /> : null}
        </View>

        {clientTx.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('finance:title', { defaultValue: 'כסף' })}</Text>
            <Card padded={false}>
              {clientTx.map((t, i) => {
                const income = t.type === 'income'
                return (
                  <View key={t.id || i} style={[styles.txRow, i > 0 && styles.txBorder]}>
                    <View style={styles.txInfo}>
                      <Text style={styles.txDesc} numberOfLines={1}>{t.desc || '—'}</Text>
                      <Text style={styles.txDate}>{fmtShortDate(t.date)}</Text>
                    </View>
                    <Text style={[styles.txAmount, { color: income ? colors.positive : colors.textSub }]}>{income ? '+' : '−'}{isr(t.amount)}</Text>
                  </View>
                )
              })}
            </Card>
          </View>
        ) : null}

        {client.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{i18n.t('modalsClient:common.notes', { defaultValue: 'הערות' })}</Text>
            <Card contentStyle={styles.notes}><Text style={styles.notesText}>{client.notes}</Text></Card>
          </View>
        ) : null}
      </ScrollView>

      <AddClientModal open={editing} client={client} onClose={() => setEditing(false)} onSave={(patch) => updateClient(clientId, patch)} onDelete={del} />
      <AddTransactionModal open={paying} defaults={{ client_id: clientId, type: 'income' }} onClose={() => setPaying(false)} onSave={addTransaction} />
    </Screen>
  )
}

function Stat({ label, value, accent }) {
  return (
    <Card contentStyle={styles.stat}>
      <Text style={[styles.statNum, accent && styles.statAccent]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  )
}

function Action({ Icon, label, onPress }) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <Icon size={20} strokeWidth={1.7} color={colors.brand} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textFaint, fontSize: 14 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, color: colors.textSub, fontWeight: '600' },
  phone: { fontSize: 13, color: colors.textFaint, marginStart: 'auto' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { alignItems: 'center', paddingVertical: 16, gap: 4 },
  statNum: { fontSize: 20, fontWeight: '600', color: colors.text },
  statAccent: { color: colors.brand },
  statLabel: { fontSize: 12, color: colors.textSub },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  actionLabel: { fontSize: 12, color: colors.text },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  txRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  txBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  txInfo: { flex: 1, gap: 2 },
  txDesc: { fontSize: 15, color: colors.text },
  txDate: { fontSize: 12, color: colors.textFaint },
  txAmount: { fontSize: 15, fontWeight: '600' },
  notes: { paddingVertical: 14, paddingHorizontal: 16 },
  notesText: { fontSize: 14, color: colors.text, lineHeight: 20 },
})

Stat.displayName = 'Stat'
