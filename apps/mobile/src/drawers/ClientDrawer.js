import { useMemo, useState } from 'react'
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Trash2, Pencil, Banknote, MessageCircle, CalendarPlus, ChevronDown, Check, RotateCcw } from 'lucide-react-native'
import { clientBalance, effectiveClientMeta, isGroupDriven, isStatusOverridden, isr } from '@simplicity/core'
import Card from '../components/Card'
import EditClientModal from '../modals/EditClientModal'
import AddTransactionModal from '../modals/AddTransactionModal'
import AddMeetingModal from '../modals/AddMeetingModal'
import AddSessionModal from '../modals/AddSessionModal'
import AddTaskModal from '../modals/AddTaskModal'
import AddReminderModal from '../modals/AddReminderModal'
import ClientDrawerSections from './ClientDrawerSections'
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
  past: { bg: colors.fill, dot: '#b3a99c' },
  no_status: { bg: colors.fill, dot: '#cbb9a8' },
}
const STATUS_ORDER = ['active', 'wandering', 'past', 'no_status']
const initials = (name) => (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function ClientDrawer({ clientId, clients, transactions, sessions, members, groups, tasks = [], reminders = [], onClose, updateClient, deleteClient, addTransaction, addSession, addMeeting, updateSession, updateTask, deleteTask, updateTransaction, deleteTransaction, updateReminder, deleteReminder }) {
  const insets = useSafeAreaInsets()
  const { projects } = useFormOptions()
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [logging, setLogging] = useState(false)
  const [statusMenu, setStatusMenu] = useState(false)
  const [editSession, setEditSession] = useState(null)
  const [editTask, setEditTask] = useState(null)
  const [editTx, setEditTx] = useState(null)
  const [editReminder, setEditReminder] = useState(null)

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
  const nextNum = client ? sessions.filter((s) => s.client_id === client.id).length + 1 : 1

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
      : `${bal.groupSessions.filter((g) => !g.ended).reduce((s, g) => s + g.held, 0)}/${bal.groupSessions.filter((g) => !g.ended).reduce((s, g) => s + (g.quota || 0), 0) || 0}`)
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
                    {groupDriven ? (
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

              {/* Per-session billing note — names the model so the growing balance is clear */}
              {bal.perSession ? (
                <Text style={styles.billNote}>{i18n.t('clients:drawer.perSessionNote', { price: isr(client.price_per_session || 0) })}</Text>
              ) : null}

              {/* Group sessions — read-only breakdown, one row per group */}
              {bal.groupSessions.length > 0 ? (
                <View style={styles.grpSessions}>
                  {bal.groupSessions.map((gs) => (
                    <View key={gs.id} style={styles.grpRow}>
                      <Text style={styles.grpName} numberOfLines={1}>{i18n.t('clients:drawer.groupSessions', { name: gs.name })}{gs.ended ? i18n.t('clients:drawer.groupEnded', { defaultValue: ' (הסתיימה)' }) : ''}</Text>
                      <Text style={styles.grpVal}>{gs.held}/{gs.quota || 0}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Payment request — only when the client owes money */}
              {bal.balance > 0 && client.phone ? (
                <Pressable
                  style={styles.payRequest}
                  onPress={() => whatsapp(`${i18n.t('clients:drawer.requestPayment', { defaultValue: 'דרישת תשלום' })} · ${isr(bal.balance)}`)}
                >
                  <MessageCircle size={15} strokeWidth={1.8} color={colors.positive} />
                  <Text style={styles.payRequestText}>{i18n.t('clients:drawer.requestPayment', { defaultValue: 'דרישת תשלום בוואטסאפ' })}</Text>
                </Pressable>
              ) : null}

              {/* Quick actions (2×2) */}
              <View style={styles.actions}>
                <Action Icon={Check} label={i18n.t('clients:drawer.logSession', { defaultValue: 'תיעוד פגישה' })} onPress={() => setLogging(true)} />
                <Action Icon={CalendarPlus} label={i18n.t('clients:drawer.scheduleMeeting', { defaultValue: 'קביעת פגישה' })} onPress={() => setScheduling(true)} />
                <Action Icon={Banknote} label={i18n.t('clients:drawer.receivedPayment', { defaultValue: 'קיבלתי תשלום' })} onPress={() => setPaying(true)} />
                {client.phone ? <Action Icon={MessageCircle} label="WhatsApp" onPress={() => whatsapp()} /> : null}
              </View>

              <ClientDrawerSections
                client={client}
                txns={transactions}
                tasks={tasks}
                reminders={reminders}
                sessions={sessions}
                members={members}
                groups={groups}
                onEditTx={setEditTx}
                onEditSession={setEditSession}
                onEditTask={setEditTask}
                onEditReminder={updateReminder ? setEditReminder : undefined}
              />
            </ScrollView>
          ) : null}
        </View>
      </View>

      <EditClientModal
        open={editing}
        client={client}
        rawPaid={bal?.paidReal ?? 0}
        memberTotal={bal?.memberTotal ?? 0}
        personalHeld={bal?.personalHeld ?? 0}
        groupSessions={bal?.groupSessions ?? []}
        onClose={() => setEditing(false)}
        onSave={(id, patch) => updateClient(id, patch)}
      />
      <AddTransactionModal open={paying} defaults={{ client_id: clientId, type: 'income' }} onClose={() => setPaying(false)} onSave={addTransaction} />
      <AddMeetingModal open={scheduling} client={client} clients={client ? [client] : []} onClose={() => setScheduling(false)} onSave={addMeeting} onSetRecurringSlot={updateClient} />

      {/* Log a session — composes the full sessions row around the modal's when/summary/notes */}
      <AddSessionModal
        open={logging}
        client={client}
        nextNum={nextNum}
        onClose={() => setLogging(false)}
        onSave={(data) => addSession({ ...data, client_id: clientId, group_id: null, subject_type: 'client', subject_id: clientId, num: nextNum })}
      />

      {/* Edit an existing session / task / payment from the sections */}
      <AddSessionModal
        open={!!editSession}
        session={editSession}
        client={client}
        onClose={() => setEditSession(null)}
        onSave={(patch) => updateSession(editSession.id, patch)}
      />
      <AddTaskModal
        open={!!editTask}
        task={editTask}
        onClose={() => setEditTask(null)}
        onSave={(patch) => updateTask(editTask.id, patch)}
        onDelete={() => { deleteTask(editTask.id); setEditTask(null) }}
      />
      <AddTransactionModal
        open={!!editTx}
        tx={editTx}
        onClose={() => setEditTx(null)}
        onSave={(payload) => updateTransaction(editTx.id, payload)}
        onDelete={() => { deleteTransaction(editTx.id); setEditTx(null) }}
      />
      <AddReminderModal
        open={!!editReminder}
        reminder={editReminder}
        onClose={() => setEditReminder(null)}
        onSave={(patch) => updateReminder(editReminder.id, patch)}
        onDelete={deleteReminder ? () => { deleteReminder(editReminder.id); setEditReminder(null) } : undefined}
      />
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
  av: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avText: { fontSize: 16, fontWeight: '600', color: colors.onBrand },
  headId: { flex: 1, minWidth: 0, gap: 5 },
  headName: { fontSize: 18, fontWeight: '700', color: colors.text },
  headSub: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '500', color: colors.text },
  byGroup: { fontSize: 11, color: colors.textFaint },
  revert: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  manualTag: { fontSize: 10, fontWeight: '600', color: colors.textSub, backgroundColor: colors.fillStrong, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
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

  billNote: { fontSize: 12, color: colors.textSub, textAlign: 'center', marginTop: -6 },
  grpSessions: { gap: 6, marginTop: -4 },
  grpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  grpName: { flex: 1, fontSize: 12, color: colors.textSub },
  grpVal: { fontSize: 12, fontWeight: '600', color: colors.text },

  payRequest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(139,168,136,0.4)', backgroundColor: 'rgba(139,168,136,0.10)' },
  payRequestText: { fontSize: 13, fontWeight: '500', color: colors.positive },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: '46%', alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  actionLabel: { fontSize: 11.5, color: colors.text },
})

HeroStat.displayName = 'HeroStat'
Action.displayName = 'Action'
