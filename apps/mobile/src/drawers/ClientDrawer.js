import { useMemo, useState } from 'react'
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Trash2, Pencil, Banknote, MessageCircle, CalendarPlus, ChevronDown, Check, RotateCcw } from 'lucide-react-native'
import { clientBalance, effectiveClientMeta, isGroupDriven, isStatusOverridden, isr, fmtShortDate } from '@simplicity/core'
import Card from '../components/Card'
import AddClientModal from '../modals/AddClientModal'
import AddTransactionModal from '../modals/AddTransactionModal'
import AddMeetingModal from '../modals/AddMeetingModal'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Client drawer ("תיק לקוח") — a slide-up overlay mirroring the web ClientDrawer:
// avatar + name + status pill + edit, a 3-stat billing hero, a WhatsApp payment
// request when the client owes, quick actions, and the recent payments + notes.
// Opened in place from the clients list (not a pushed screen).
const STATUS_PILL = {
  active: { bg: 'rgba(139,168,136,0.16)', dot: '#8BA888' },
  wandering: { bg: 'rgba(212,165,116,0.18)', dot: '#D4A574' },
  past: { bg: 'rgba(42,37,32,0.06)', dot: '#b3a99c' },
  no_status: { bg: 'rgba(42,37,32,0.06)', dot: '#cbb9a8' },
}
const STATUS_ORDER = ['active', 'wandering', 'past', 'no_status']
const initials = (name) => (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function ClientDrawer({ clientId, clients, transactions, sessions, members, groups, onClose, updateClient, deleteClient, addTransaction }) {
  const insets = useSafeAreaInsets()
  const { projects } = useFormOptions()
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [statusMenu, setStatusMenu] = useState(false)

  const client = clients.find((c) => c.id === clientId) || null
  const bal = useMemo(
    () => (client ? clientBalance(client, transactions, sessions, members, groups) : null),
    [client, transactions, sessions, members, groups],
  )
  const meta = client ? effectiveClientMeta(client, members, groups) : 'no_status'
  const groupDriven = client ? isGroupDriven(client, members) : false
  const overridden = isStatusOverridden(client)
  const isMember = !!client && members.some((m) => m.client_id === client.id && !m.left_at)
  const project = client ? projects.find((p) => p.id === client.project_id) : null
  const clientTx = useMemo(
    () => (client
      ? transactions.filter((t) => t.client_id === client.id && !t.deleted_at)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 12)
      : []),
    [transactions, client],
  )

  // Manual status change always sets status_overridden so the choice wins over
  // any group the client belongs to (migration 0062); revert clears the override.
  const changeStatus = (k) => {
    setStatusMenu(false)
    if (!client || (client.status_meta === k && client.status_overridden)) return
    updateClient(client.id, { status_meta: k, status_id: null, status_overridden: true })
  }
  const revertToGroup = () => {
    setStatusMenu(false)
    if (!client || !client.status_overridden) return
    updateClient(client.id, { status_overridden: false })
  }

  const del = () => { if (client) { deleteClient(client.id); onClose() } }
  const whatsapp = (msg) => {
    const p = (client?.phone || '').replace(/\D/g, '')
    if (p) Linking.openURL(`https://wa.me/${p}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`)
  }

  const sessLabel = bal
    ? (bal.hasPersonal
      ? (bal.perSession ? `${bal.personalDone}` : `${bal.personalDone}/${bal.personalQuota || 0}`)
      : `${bal.groupSessions.reduce((s, g) => s + g.held, 0)}/${bal.groupSessions.reduce((s, g) => s + (g.quota || 0), 0) || 0}`)
    : '—'

  return (
    <Modal visible={!!clientId} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
          <View style={styles.topbar}>
            <Pressable style={styles.topBtn} onPress={onClose} hitSlop={8}>
              <X size={18} strokeWidth={1.7} color={colors.textSub} />
            </Pressable>
            <Text style={styles.topTitle}>{i18n.t('clients:drawer.title', { defaultValue: 'תיק לקוח' })}</Text>
            <Pressable style={styles.topBtn} onPress={del} hitSlop={8}>
              <Trash2 size={17} strokeWidth={1.7} color={colors.danger} />
            </Pressable>
          </View>

          {client ? (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {/* Header — avatar + name + status pill + project + edit */}
              <View style={styles.header}>
                <View style={styles.av}><Text style={styles.avText}>{initials(client.name)}</Text></View>
                <View style={styles.headId}>
                  <Text style={styles.headName} numberOfLines={1}>{client.name}</Text>
                  <View style={styles.headSub}>
                    <Pressable
                      style={[styles.statusPill, { backgroundColor: (STATUS_PILL[meta] || STATUS_PILL.no_status).bg }]}
                      onPress={() => setStatusMenu((o) => !o)}
                    >
                      <Text style={styles.statusText}>{i18n.t(`clients:status.${meta === 'no_status' ? 'noStatus' : meta}`, { defaultValue: '' })}</Text>
                      <ChevronDown size={12} strokeWidth={2} color={colors.textSub} />
                    </Pressable>
                    {groupDriven && !overridden ? (
                      <Text style={styles.byGroup}>{i18n.t('clients:drawer.byGroup', { defaultValue: ' · לפי הקבוצה' })}</Text>
                    ) : null}
                    {isMember && overridden ? (
                      <Pressable style={styles.revert} onPress={revertToGroup}>
                        <Text style={styles.manualTag}>{i18n.t('clients:drawer.statusManual', { defaultValue: 'ידני' })}</Text>
                        <RotateCcw size={11} strokeWidth={1.8} color={colors.textSub} />
                        <Text style={styles.revertText}>{i18n.t('clients:drawer.revertToGroup', { defaultValue: 'חזרה לסטטוס הקבוצה' })}</Text>
                      </Pressable>
                    ) : null}
                    {project ? <Text style={styles.projText}>· {project.name}</Text> : null}
                  </View>
                  {statusMenu ? (
                    <View style={styles.statusMenu}>
                      {STATUS_ORDER.map((k) => (
                        <Pressable key={k} style={styles.statusOpt} onPress={() => changeStatus(k)}>
                          <View style={[styles.statusDot, { backgroundColor: STATUS_PILL[k].dot }]} />
                          <Text style={[styles.statusOptText, meta === k && styles.statusOptOn]}>{i18n.t(`clients:status.${k === 'no_status' ? 'noStatus' : k}`)}</Text>
                          {meta === k ? <Check size={13} strokeWidth={2} color={colors.brand} /> : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
                <Pressable style={styles.editBtn} onPress={() => setEditing(true)} hitSlop={6}>
                  <Pencil size={13} strokeWidth={1.7} color={colors.textSub} />
                  <Text style={styles.editText}>{i18n.t('clients:drawer.edit', { defaultValue: 'ערוך' })}</Text>
                </Pressable>
              </View>

              {/* Billing hero — sessions / paid / balance */}
              <Card padded={false} contentStyle={styles.hero}>
                <HeroStat label={i18n.t('clients:drawer.sessions', { defaultValue: 'פגישות' })} value={sessLabel} />
                <HeroStat label={i18n.t('clients:drawer.paid', { defaultValue: 'שולם' })} value={isr(bal.paid)} divided />
                <HeroStat label={i18n.t('clients:drawer.balance', { defaultValue: 'יתרה' })} value={isr(bal.balance)} accent={bal.balance > 0} />
              </Card>

              {/* Payment request — only when the client owes money */}
              {bal.balance > 0 && client.phone ? (
                <Pressable
                  style={styles.payRequest}
                  onPress={() => whatsapp(`${i18n.t('clients:drawer.requestPayment', { defaultValue: 'דרישת תשלום' })} · ${isr(bal.balance)}`)}
                >
                  <MessageCircle size={16} strokeWidth={1.8} color={colors.onBrand} />
                  <Text style={styles.payRequestText}>{i18n.t('clients:drawer.requestPayment', { defaultValue: 'דרישת תשלום בוואטסאפ' })}</Text>
                </Pressable>
              ) : null}

              {/* Quick actions */}
              <View style={styles.actions}>
                <Action Icon={CalendarPlus} label={i18n.t('clients:drawer.scheduleMeeting', { defaultValue: 'קביעת פגישה' })} onPress={() => setScheduling(true)} />
                <Action Icon={Banknote} label={i18n.t('clients:drawer.receivedPayment', { defaultValue: 'קיבלתי תשלום' })} onPress={() => setPaying(true)} />
                {client.phone ? <Action Icon={MessageCircle} label="WhatsApp" onPress={() => whatsapp()} /> : null}
              </View>

              {/* Recent payments */}
              {clientTx.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{i18n.t('clients:sections.payments', { defaultValue: 'תשלומים' })}</Text>
                  <Card padded={false}>
                    {clientTx.map((t, i) => {
                      const income = t.type === 'income'
                      return (
                        <View key={t.id || i} style={[styles.txRow, i > 0 && styles.txBorder]}>
                          <View style={styles.txInfo}>
                            <Text style={styles.txDesc} numberOfLines={1}>{t.desc || i18n.t('clients:sections.noDesc', { defaultValue: '—' })}</Text>
                            <Text style={styles.txDate}>{fmtShortDate(t.date)}{t.status === 'pending' ? i18n.t('clients:sections.pending', { defaultValue: ' · ממתין' }) : ''}</Text>
                          </View>
                          <Text style={[styles.txAmount, { color: income ? colors.positive : colors.textSub }]}>{income ? '+' : '−'}{isr(t.amount)}</Text>
                        </View>
                      )
                    })}
                  </Card>
                </View>
              ) : null}

              {/* Notes */}
              {client.notes ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{i18n.t('clients:sections.notes', { defaultValue: 'הערות' })}</Text>
                  <Card padded={false} contentStyle={styles.notes}><Text style={styles.notesText}>{client.notes}</Text></Card>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>

      <AddClientModal open={editing} client={client} onClose={() => setEditing(false)} onSave={(patch) => updateClient(client.id, patch)} onDelete={del} />
      <AddTransactionModal open={paying} defaults={{ client_id: clientId, type: 'income' }} onClose={() => setPaying(false)} onSave={addTransaction} />
      <AddMeetingModal open={scheduling} clients={client ? [client] : []} onClose={() => setScheduling(false)} onSave={async () => {}} />
    </Modal>
  )
}

function HeroStat({ label, value, accent, divided }) {
  return (
    <View style={[styles.stat, divided && styles.statDivided]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statAccent]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  )
}

function Action({ Icon, label, onPress }) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <Icon size={17} strokeWidth={1.7} color={colors.brand} />
      <Text style={styles.actionLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,37,32,0.35)' },
  panel: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '92%', overflow: 'hidden' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  topBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardFlat, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 15, fontWeight: '600', color: colors.textSub, letterSpacing: 0.3 },
  scroll: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, gap: 16 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  av: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
  headId: { flex: 1, minWidth: 0, gap: 5 },
  headName: { fontSize: 18, fontWeight: '600', color: colors.text },
  headSub: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '500', color: colors.text },
  byGroup: { fontSize: 11, color: colors.textFaint },
  revert: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  manualTag: { fontSize: 10, fontWeight: '600', color: colors.textSub, backgroundColor: 'rgba(42,37,32,0.07)', paddingVertical: 1, paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
  revertText: { fontSize: 10, color: colors.textSub },
  projText: { fontSize: 11, color: colors.textSub },
  statusMenu: { marginTop: 8, marginStart: 58, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 4 },
  statusOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusOptText: { flex: 1, fontSize: 13, color: colors.text },
  statusOptOn: { color: colors.brand, fontWeight: '600' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  editText: { fontSize: 12, color: colors.textSub },

  hero: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  statLabel: { fontSize: 10, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '500', color: colors.text },
  statAccent: { color: colors.brand },

  payRequest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.positive },
  payRequestText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },

  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  actionLabel: { fontSize: 11.5, color: colors.text },

  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSub },
  txRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  txBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  txInfo: { flex: 1, gap: 2 },
  txDesc: { fontSize: 14, color: colors.text },
  txDate: { fontSize: 12, color: colors.textFaint },
  txAmount: { fontSize: 14, fontWeight: '600' },
  notes: { paddingVertical: 14, paddingHorizontal: 16 },
  notesText: { fontSize: 14, color: colors.text, lineHeight: 20 },
})

HeroStat.displayName = 'HeroStat'
Action.displayName = 'Action'
