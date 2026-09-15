import { useMemo, useState } from 'react'
import { Modal, View, StyleSheet, ScrollView, Linking, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Trash2, Pencil, Banknote, MessageCircle, ChevronDown, Check, RotateCcw, Phone, Mail, PackagePlus } from 'lucide-react-native'
import { clientBalance, effectiveClientMeta, isGroupDriven, isStatusOverridden, planBalance, planInstallments, isr, waLink, normalizeIsraeliPhone } from '@simplicity/core'
import Card from '../components/Card'
import EditClientModal from '../modals/EditClientModal'
import AddTransactionModal from '../modals/AddTransactionModal'
import AddSessionModal from '../modals/AddSessionModal'
import AddSessionsModal from '../modals/AddSessionsModal'
import AddTaskModal from '../modals/AddTaskModal'
import AddReminderModal from '../modals/AddReminderModal'
import ClientDrawerSections from './ClientDrawerSections'
import { useFormOptions } from '../lib/formOptions'
import { pushUndo } from '../lib/undo'
import { usePaymentPlans } from '../hooks/usePaymentPlans'
import { useRecurring } from '../hooks/useRecurring'
import { confirmRemoveTransaction } from '../lib/recurringTx'
import { useWhatsAppMessage } from '../hooks/useWhatsAppMessage'
import { useClientAdjustments } from '../hooks/useClientAdjustments'
import AdjustmentModal from '../modals/AdjustmentModal'
import { showError } from '../lib/toast'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed, themedMap } from '../theme/themed'

// Client drawer ("תיק לקוח") — a slide-up overlay mirroring the web ClientDrawer:
// avatar + name + status pill + edit, a 3-stat billing hero, a WhatsApp payment
// request when the client owes, quick actions, and the recent payments + notes.
// Opened in place from the clients list (not a pushed screen).
const STATUS_PILL = themedMap((c) => ({
  active: { bg: 'rgba(139,168,136,0.16)', dot: '#8BA888' },
  wandering: { bg: 'rgba(212,165,116,0.18)', dot: '#D4A574' },
  past: { bg: c.fill, dot: '#b3a99c' },
  no_status: { bg: c.fill, dot: '#cbb9a8' },
}))
const STATUS_ORDER = ['active', 'wandering', 'past', 'no_status']
const initials = (name) => (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function ClientDrawer({ clientId, clients, transactions, sessions, members, groups, tasks = [], reminders = [], onClose, updateClient, deleteClient, addTransaction, addSession, updateSession, deleteSession, updateTask, deleteTask, updateTransaction, deleteTransaction, restoreTransaction, updateReminder, deleteReminder, updateMember, onDataChanged }) {
  const insets = useSafeAreaInsets()
  const { projects } = useFormOptions()
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payDefaults, setPayDefaults] = useState(null)   // prefill for the "record payment" modal
  /* Adjustments (web ClientDrawer): the «התאמה» link opens the sheet on the
     card's own figures; a hand-edited «שולם»/«יתרה» in the edit form queues a
     reason sheet per figure. A QUEUE, because one save can change both — a
     discount given and cash received are two events with two reasons. */
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustQueue, setAdjustQueue] = useState([])
  const headAdjust = adjustQueue[0] || null
  const queueAdjust = (entry) => setAdjustQueue((q) => [...q, entry])
  const shiftAdjust = () => setAdjustQueue((q) => (q.length ? q.slice(1) : q))
  const [logging, setLogging] = useState(false)
  const [addingSessions, setAddingSessions] = useState(false)
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
  // Payment-plan glance for the hint under the hero (the full plan lives in the
  // sections' PaymentPlanSection; this mirrors web's small summary line).
  const { plans, installments, refetch: refetchPlans } = usePaymentPlans()
  /* A plan write changes money this drawer shows (the income ledger, the
     client's total), and neither the hero nor this hint's own plan copy heard
     about it. Refresh both. */
  const onPlanChanged = () => { refetchPlans(); onDataChanged?.() }
  /* The rules that are still generating — a payment one of them owns needs the
     warning, not the plain delete (see lib/recurringTx.js). */
  const { templates, updateRecurring } = useRecurring()
  const plan = client ? (plans.find((p) => p.client_id === client.id) || null) : null
  const planBal = plan ? planBalance(plan, planInstallments(plan.id, installments)) : null

  // Manual status change always sets status_overridden so the choice wins over
  // any group the client belongs to (migration 0062); revert clears the override.
  /* Each of these offers a one-step undo, as on web. The snapshot is taken
     from the client BEFORE the write, so undo restores the exact prior values
     rather than guessing at defaults. */
  const changeStatus = (k) => {
    setStatusMenu(false)
    if (!client || (client.status_meta === k && client.status_overridden)) return
    const prev = { status_meta: client.status_meta ?? null, status_id: client.status_id ?? null, status_overridden: !!client.status_overridden }
    const next = { status_meta: k, status_id: null, status_overridden: true }
    updateClient(client.id, next)
    pushUndo({
      label: i18n.t('clients:drawer.statusChanged'),
      undo: async () => { await updateClient(client.id, prev) },
      redo: async () => { await updateClient(client.id, next) },
    })
  }
  const revertToGroup = () => {
    setStatusMenu(false)
    if (!client || !client.status_overridden) return
    updateClient(client.id, { status_overridden: false })
    pushUndo({
      label: i18n.t('clients:drawer.statusReverted'),
      undo: async () => { await updateClient(client.id, { status_overridden: true }) },
      redo: async () => { await updateClient(client.id, { status_overridden: false }) },
    })
  }

  /* The ledger. Every adjustment lands with a reason and a date, and can be
     taken back — money included — from the payments panel. */
  const { adjustments, addAdjustment, removeAdjustment } = useClientAdjustments({ onChanged: onDataChanged })
  const clientAdjustments = client ? adjustments.filter((a) => a.client_id === client.id) : []
  const recordAdjustment = ({ kind, reason, amount, note }) => addAdjustment(client, {
    kind, reason, amount, note,
    undoLabel: i18n.t('clients:adjust.undoLabel', { amount: isr(Math.abs(Number(amount) || 0)) }),
  })
  const dropAdjustment = (adjustment) => removeAdjustment(client, adjustment, { undoLabel: i18n.t('clients:adjust.undoDeleted') })
    .catch(() => showError(i18n.t('clients:adjust.saveFailed')))

  const del = () => {
    if (!client) return
    const cancel = i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })
    const linkedTxs = (transactions || []).filter((t) => !t.deleted_at && t.client_id === client.id)
    // No linked transactions → straightforward soft-delete.
    if (!linkedTxs.length) {
      Alert.alert(
        i18n.t('modalsClient:deleteClient.titleOne', { name: client.name }),
        i18n.t('clients:drawer.deleteMessage', { defaultValue: 'הלקוח יעבור לסל המיחזור, וניתן לשחזר תוך 30 יום.' }),
        [
          { text: cancel, style: 'cancel' },
          { text: i18n.t('leads:delete.confirm', { defaultValue: 'מחק' }), style: 'destructive', onPress: () => { deleteClient(client.id); onClose() } },
        ],
      )
      return
    }
    // Linked transactions → offer keep-orphaned vs cascade, mirroring web
    // DeleteClientModal. Without this the client's transactions dangled on a
    // deleted client_id, untagged. (Mobile has no undo toast; both are
    // restorable from Trash.)
    const keep = async () => {
      for (const tx of linkedTxs) {
        await updateTransaction(tx.id, { client_id: null, orphaned_from: { type: 'client', name: client.name || i18n.t('modalsClient:deleteClient.orphanName') } }).catch(() => {})
      }
      await deleteClient(client.id).catch(() => {})
      onClose()
    }
    const cascade = async () => {
      for (const tx of linkedTxs) { await deleteTransaction(tx.id).catch(() => {}) }
      await deleteClient(client.id).catch(() => {})
      onClose()
    }
    Alert.alert(
      i18n.t('modalsClient:deleteClient.titleOne', { name: client.name }),
      `${i18n.t('modalsClient:deleteClient.introOne')}\n\n${i18n.t('modalsClient:deleteClient.linkedTransactions')}: ${linkedTxs.length}`,
      [
        { text: cancel, style: 'cancel' },
        { text: i18n.t('modalsClient:deleteClient.keepTitle'), onPress: keep },
        { text: i18n.t('modalsClient:deleteClient.cascadeTitle'), style: 'destructive', onPress: cascade },
      ],
    )
  }
  // core waLink turns 050-1234567 into 972501234567; wa.me cannot resolve the
  // local form, which is what stripping non-digits used to send.
  const whatsapp = (msg) => {
    if (normalizeIsraeliPhone(client?.phone)) Linking.openURL(waLink(client.phone, msg))
  }
  // The coach's own templates (Connections → WhatsApp), or the defaults.
  const waMsg = useWhatsAppMessage()

  /* The hero's meetings figure, by the rule web's file and card share: one
     running track reads as its own progress, several as the count held
     across them. The old reading summed group quotas into one denominator,
     which described no track in particular. */
  const tracks = bal?.tracks || []
  const running = tracks.filter((tr) => !tr.ended)
  const sessLabel = !bal
    ? '—'
    : running.length === 1
      ? (running[0].quota == null ? `${running[0].held}` : `${running[0].held}/${running[0].quota}`)
      : `${running.reduce((s, tr) => s + tr.held, 0)}`
  /* A plain 1-on-1 client is their one track and the hero already says it; a
     group member gets the row naming the group and its terms, and anyone
     running two gets both. */
  const showTracks = tracks.length > 1 || tracks.some((tr) => tr.kind === 'group')

  /* Android back peels one layer: an open status menu first, the whole drawer
     only once nothing is stacked on top of it. Everything else in here (edit,
     payment, session…) is its own Modal and gets its own back. */
  const closeTop = () => { if (statusMenu) setStatusMenu(false); else onClose() }

  /* Android gives a Modal its own window, and by default that window
     stops below the status bar while the app behind it draws edge-to-edge.
     The backdrop therefore dimmed everything except a bright strip along
     the top, with a hard edge across it. Both flags let the window cover
     what the app covers; the panel already pads itself by insets.bottom,
     so nothing lands under the gesture bar. */
  return (
    <Modal
      visible={!!clientId}
      transparent
      animationType="slide"
      onRequestClose={closeTop}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        {/* No ripple: on a full-screen backdrop it would flash the whole screen. */}
        <Pressable style={styles.backdrop} onPress={onClose} android_ripple={null} />
        {/* The client file holds editable fields — notes, «פרטים נוספים», the
            inline session and payment rows — inside a panel pinned to the
            bottom at a fixed 92% height, and had no keyboard handling at all,
            so the keyboard came up over whatever was being typed into. Same
            wrapper the Sheet uses, for the same reason; box-none keeps taps in
            the strip above the panel reaching the backdrop. */}
        <KeyboardAvoidingView
          style={styles.kav}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.panel, { paddingBottom: insets.bottom }]}>
            <View style={styles.topbar}>
              <Pressable style={styles.topBtn} onPress={onClose} hitSlop={8} accessibilityLabel={i18n.t('common:close', { defaultValue: 'סגירה' })}>
                <X size={18} strokeWidth={1.7} color={colors.textSub} />
              </Pressable>
              <Text style={styles.topTitle}>{i18n.t('clients:drawer.title', { defaultValue: 'תיק לקוח' })}</Text>
              <Pressable style={styles.topBtn} onPress={del} hitSlop={8} accessibilityLabel={i18n.t('clients:bulk.delete', { defaultValue: 'מחיקה' })}>
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

                {/* Phone and email were collected on every client and shown
                    nowhere — the phone only ever fed the WhatsApp button, the
                    email nothing at all. Pressable so the platform does the
                    obvious thing: tel: dials, mailto: opens the mail app. The
                    number displays exactly as typed; only the dial target is
                    stripped. Matches the web client file. */}
                {client.phone || client.email ? (
                  <View style={styles.contact}>
                    {client.phone ? (
                      <Pressable style={styles.contactItem} onPress={() => Linking.openURL(`tel:${String(client.phone).replace(/[^\d+]/g, '')}`)}>
                        <Phone size={13} strokeWidth={1.7} color={colors.textSub} />
                        <Text style={styles.contactText}>{client.phone}</Text>
                      </Pressable>
                    ) : null}
                    {client.email ? (
                      <Pressable style={styles.contactItem} onPress={() => Linking.openURL(`mailto:${client.email}`)}>
                        <Mail size={13} strokeWidth={1.7} color={colors.textSub} />
                        <Text style={styles.contactText}>{client.email}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* Billing hero — sessions / paid / balance */}
                <Card padded={false} contentStyle={styles.hero}>
                  <HeroStat label={i18n.t('clients:drawer.sessions', { defaultValue: 'פגישות' })} value={sessLabel} />
                  <HeroStat label={i18n.t('clients:drawer.paid', { defaultValue: 'שולם' })} value={isr(bal.paid)} divided />
                  <HeroStat label={i18n.t('clients:drawer.balance', { defaultValue: 'יתרה' })} value={isr(bal.balance)} accent={bal.balance > 0} />
                </Card>

                {/* One way in for a discount, an import fix or cash that was
                    never booked — instead of knowing that each is entered by
                    hand-editing a different number. */}
                <Pressable style={styles.adjustLink} onPress={() => setAdjustOpen(true)} accessibilityRole="button" hitSlop={6}>
                  <Text style={styles.adjustLinkText}>{i18n.t('clients:adjust.open')}</Text>
                </Pressable>

                {/* Per-session billing note — names the model so the growing balance is clear */}
                {bal.perSession ? (
                  <Text style={styles.billNote}>{i18n.t('clients:drawer.perSessionNote', { price: isr(client.price_per_session || 0) })}</Text>
                ) : null}

                {/* Payment plan hint — quick glance (full plan is in the sections below) */}
                {plan && planBal ? (
                  <Text style={styles.planHint}>{i18n.t('clients:drawer.planHint', { received: planBal.receivedCount, total: planBal.count, remaining: isr(planBal.remaining) })}</Text>
                ) : null}

                {/* Tracks — each group the client is in and the personal
                    series, with its terms, progress and money. The phone
                    listed only group meetings as held/quota, so "did she pay
                    for the workshop" had no answer here; a payment says which
                    track it was for (transactions.group_id), and core
                    clientBalance splits the money by it. */}
                {showTracks ? (
                  <View style={styles.tracks}>
                    <Text style={styles.tracksTitle}>{i18n.t('clients:tracks.title')}</Text>
                    {tracks.map((tr) => {
                      const isGroup = tr.kind === 'group'
                      const dot = isGroup ? (groups.find((g) => g.id === tr.id)?.color || colors.textSub) : colors.positive
                      return (
                        <View key={`${tr.kind}-${tr.id}`} style={[styles.track, tr.ended && styles.trackEnded]}>
                          <View style={[styles.trackDot, { backgroundColor: dot }]} />
                          <View style={styles.trackId}>
                            <Text style={styles.trackName} numberOfLines={1}>
                              {isGroup ? tr.name : i18n.t('clients:tracks.personal')}{tr.ended ? i18n.t('clients:drawer.groupEnded') : ''}
                            </Text>
                            <Text style={styles.trackSub} numberOfLines={1}>
                              {i18n.t(`clients:tracks.mode.${tr.mode}`)}
                              {' · '}
                              {tr.quota == null
                                ? i18n.t('clients:tracks.progressNoQuota', { count: tr.held })
                                : i18n.t('clients:tracks.progress', { held: tr.held, quota: tr.quota })}
                            </Text>
                          </View>
                          <View style={styles.trackMoney}>
                            <Text style={styles.trackAmt} accessibilityLabel={`${i18n.t('clients:tracks.amountAria')} ${isr(tr.total)}`}>{isr(tr.total)}</Text>
                            <Text style={styles.trackSub} numberOfLines={1}>
                              {i18n.t('clients:tracks.paidOf', { paid: isr(tr.paid) })}
                              {tr.balance > 0 ? ` · ${i18n.t('clients:tracks.left', { amount: isr(tr.balance) })}` : ''}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                    {/* Money that came in without saying which track it was
                        for — reported, not shared out by guesswork. */}
                    {bal.unallocatedPaid > 0 ? (
                      <Text style={styles.tracksNote}>{i18n.t('clients:tracks.unallocated', { amount: isr(bal.unallocatedPaid) })}</Text>
                    ) : null}
                    {/* A written-off debt lowers the account without belonging
                        to any one track, so the hero can differ from the rows. */}
                    {bal.adjustment ? (
                      <Text style={styles.tracksNote}>{i18n.t('clients:tracks.writeOffNote', { amount: isr(bal.adjustment) })}</Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Payment request — only when the client owes money. The
                    coach's payment template, with the balance filled in. */}
                {bal.balance > 0 && client.phone ? (
                  <Pressable
                    style={styles.payRequest}
                    onPress={() => whatsapp(waMsg('payment', { name: client.name, balance: isr(bal.balance) }))}
                  >
                    <MessageCircle size={15} strokeWidth={1.8} color={colors.positive} />
                    <Text style={styles.payRequestText}>{i18n.t('clients:drawer.requestPayment', { defaultValue: 'דרישת תשלום בוואטסאפ' })}</Text>
                  </Pressable>
                ) : null}

                {/* Quick actions (2×2) */}
                <View style={styles.actions}>
                  <Action Icon={Check} label={i18n.t('clients:drawer.logSession', { defaultValue: 'תיעוד פגישה' })} onPress={() => setLogging(true)} />
                  <Action Icon={Banknote} label={i18n.t('clients:drawer.receivedPayment', { defaultValue: 'קיבלתי תשלום' })} onPress={() => setPaying(true)} />
                  {/* Adds to the PERSONAL quota, so only for a client who has a
                      personal track (web ClientDrawer). On a pure group member
                      it created a private series beside the group's, which the
                      balance then billed on top of the group dues. */}
                  {bal?.hasPersonal ? <Action Icon={PackagePlus} label={i18n.t('clients:addSessions.title')} onPress={() => setAddingSessions(true)} /> : null}
                  {client.phone ? <Action Icon={MessageCircle} label="WhatsApp" onPress={() => whatsapp(waMsg('client', { name: client.name }))} /> : null}
                </View>

                <ClientDrawerSections
                  client={client}
                  txns={transactions}
                  tasks={tasks}
                  reminders={reminders}
                  sessions={sessions}
                  members={members}
                  groups={groups}
                  onEditClient={() => setEditing(true)}
                  /* «פרטים נוספים» and «הערות» edit in place now instead of
                     opening the whole form — same as web. Passed straight
                     through: the sections do their own optimistic save. */
                  onUpdateClient={updateClient}
                  onEditTx={setEditTx}
                  onEditSession={setEditSession}
                  onEditTask={setEditTask}
                  onEditReminder={updateReminder ? setEditReminder : undefined}
                  onPlanChanged={onPlanChanged}
                  balance={bal}
                  adjustments={clientAdjustments}
                  onRemoveAdjustment={dropAdjustment}
                />
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>

      <EditClientModal
        open={editing}
        client={client}
        rawPaid={bal?.paidReal ?? 0}
        memberTotal={bal?.memberTotal ?? 0}
        personalHeld={bal?.personalHeld ?? 0}
        groupSessions={bal?.groupSessions ?? []}
        onClose={() => setEditing(false)}
        /* Same rule as web: snapshot only the fields the patch names, and
           stay quiet when nothing actually changed — the patch lists every
           column every time, so a column the row does not carry would
           otherwise "differ" from its default on an untouched save. */
        onSave={async (id, patch) => {
          const prev = {}
          let changed = false
          for (const k of Object.keys(patch)) {
            prev[k] = client[k] ?? null
            if (client[k] === undefined) continue
            if ((patch[k] ?? null) !== prev[k]) changed = true
          }
          await updateClient(id, patch)
          if (!changed) return
          pushUndo({
            label: i18n.t('clients:drawer.editUndo'),
            undo: async () => { await updateClient(id, prev) },
            redo: async () => { await updateClient(id, patch) },
          })
        }}
        /* A hand-edited «שולם» is money the coach says arrived; a hand-edited
           «יתרה» is debt written off. Each opens the reason sheet pre-picked. */
        onPaidEntry={(delta) => queueAdjust({ amount: delta, reason: 'unrecorded_payment' })}
        onBalanceEntry={(delta) => queueAdjust({ amount: delta, reason: 'discount' })}
        memberships={client ? members.filter((m) => m.client_id === client.id && !m.left_at) : []}
        onUpdateMember={updateMember}
      />
      <AddTransactionModal
        open={paying}
        defaults={payDefaults || { client_id: clientId, type: 'income' }}
        onClose={() => { setPayDefaults(null); setPaying(false) }}
        onSave={addTransaction}
      />
      {/* The adjustment sheet — from the «התאמה» link, or seeded by a hand-edited
          «שולם»/«יתרה». It stands down while the income form is up: booking the
          money as income shifts the queue and opens that form instead, and the
          next queued entry comes back once it closes. */}
      <AdjustmentModal
        key={`adj-${client?.id}-${adjustQueue.length}-${headAdjust?.amount ?? 'x'}-${adjustOpen}`}
        open={adjustOpen || (!!headAdjust && !paying)}
        onClose={() => { setAdjustOpen(false); shiftAdjust() }}
        client={client}
        balance={bal}
        onSaveClient={(patch) => updateClient(client.id, patch)}
        presetAmount={adjustOpen ? null : (headAdjust?.amount ?? null)}
        presetReason={adjustOpen ? null : (headAdjust?.reason ?? null)}
        moreQueued={adjustQueue.length > 1}
        onSave={recordAdjustment}
        onAlsoRecordIncome={(amount, note) => {
          /* INSTEAD of an adjustment, never as well: the income row and a
             paid_adjustment would count the same shekel twice. */
          shiftAdjust()
          setAdjustOpen(false)
          setPayDefaults({ client_id: clientId, type: 'income', amount: String(amount), desc: note || i18n.t('clients:drawer.paymentDefaultDesc', { defaultValue: 'עדכון תשלום' }) })
          setPaying(true)
        }}
      />
      {/* "קביעת פגישה" is gone from the actions above, as it is on web:
          booking happens in the calendar, every time. The weekly slot this
          could also set is still set in the edit sheet's scheduling section. */}
      <AddSessionsModal
        open={addingSessions}
        onClose={() => setAddingSessions(false)}
        client={client}
        onSave={async (next) => {
          const prev = Number(client.sessions) || 0
          await updateClient(client.id, { sessions: next })
          pushUndo({
            label: i18n.t('clients:addSessions.undo', { n: next - prev }),
            undo: async () => { await updateClient(client.id, { sessions: prev }) },
            redo: async () => { await updateClient(client.id, { sessions: next }) },
          })
        }}
      />

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
        onDelete={deleteSession}
      />
      <AddTaskModal
        open={!!editTask}
        task={editTask}
        onClose={() => setEditTask(null)}
        onSave={(patch) => updateTask(editTask.id, patch)}
        onDelete={() => { deleteTask(editTask.id); setEditTask(null) }}
      />
      {/* Same guard as the finance screen: a payment a LIVE recurring rule
          still owns cannot just be deleted — the rule refills the slot on the
          next web load — so the delete asks first and pauses the rule. */}
      <AddTransactionModal
        open={!!editTx}
        tx={editTx}
        onClose={() => setEditTx(null)}
        onSave={(payload) => updateTransaction(editTx.id, payload)}
        onDelete={() => confirmRemoveTransaction({
          tx: editTx, templates, deleteTransaction, restoreTransaction, updateRecurring,
          afterDelete: () => setEditTx(null),
        })}
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

const styles = themed((c, t) => ({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  kav: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,37,32,0.35)' },
  panel: { backgroundColor: c.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '92%', overflow: 'hidden' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  topBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.cardFlat, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 15, fontWeight: '600', color: c.textSub, letterSpacing: 0.3 },
  scroll: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, gap: 16 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  av: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  avText: { fontSize: 16, fontWeight: '600', color: c.onBrand },
  headId: { flex: 1, minWidth: 0, gap: 5 },
  headName: { fontSize: 18, fontWeight: '700', color: c.text },
  headSub: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '500', color: c.text },
  byGroup: { fontSize: 11, color: c.textFaint },
  revert: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  manualTag: { fontSize: 10, fontWeight: '600', color: c.textSub, backgroundColor: c.fillStrong, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' },
  revertText: { fontSize: 10, color: c.textSub },
  projText: { fontSize: 11, color: c.textSub },
  statusMenu: { marginTop: 8, marginStart: 58, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 4 },
  statusOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusOptText: { flex: 1, fontSize: 13, color: c.text },
  statusOptOn: { color: c.brand, fontWeight: '600' },
  editBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  editText: { fontSize: 12, color: c.textSub },

  contact: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 12 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactText: { fontSize: 12, color: c.textSub },
  hero: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.divider },
  statLabel: { fontSize: 10, fontWeight: '500', color: c.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '500', color: c.text },
  statAccent: { color: c.brand },

  adjustLink: { alignSelf: 'center', minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, marginTop: -8 },
  adjustLinkText: { fontSize: 13, fontWeight: '600', color: c.brand },
  billNote: { fontSize: 12, color: c.textSub, textAlign: 'center', marginTop: -6 },
  planHint: { fontSize: 12, color: c.textSub, textAlign: 'center' },
  tracks: { gap: 8, marginTop: -4, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.divider, backgroundColor: c.cardFlat },
  tracksTitle: { fontSize: 11, fontWeight: '600', color: c.textSub, letterSpacing: 0.3 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackEnded: { opacity: 0.55 },
  trackDot: { width: 9, height: 9, borderRadius: 5 },
  trackId: { flex: 1, minWidth: 0, gap: 2 },
  trackName: { fontSize: 13, fontWeight: '600', color: c.text },
  trackSub: { fontSize: 11, color: c.textSub },
  trackMoney: { alignItems: 'flex-end', gap: 2, maxWidth: '48%' },
  trackAmt: { fontSize: 13, fontWeight: '600', color: c.text },
  tracksNote: { fontSize: 11, color: c.textSub, lineHeight: 16 },

  payRequest: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(139,168,136,0.4)', backgroundColor: 'rgba(139,168,136,0.10)' },
  payRequestText: { fontSize: 13, fontWeight: '500', color: c.positive },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: '46%', alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  actionLabel: { fontSize: 11.5, color: c.text },
}))

HeroStat.displayName = 'HeroStat'
Action.displayName = 'Action'
