import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronDown, Pencil } from 'lucide-react-native'
import { getClientMemberships, financeQuery, isConfirmedTx, isr, fmtShortDate, fmtTime } from '@simplicity/core'
import Card from '../components/Card'
import PaymentPlanSection from './PaymentPlanSection'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Client drawer activity + contact panels (mirrors web ClientDrawerSections):
// collapsible sections for sessions / payments / tasks / timeline and
// more-details / notes / reminders / memberships. Rows for sessions, payments
// and tasks are tappable to edit; the rest are read-only (edit via the client
// Edit button).
const PRIORITY_COLOR = { high: colors.danger, medium: colors.amberWarn, low: colors.positive }
const live = (a) => (a || []).filter((r) => !r.deleted_at)
const T = (k, o) => i18n.t(`clients:sections.${k}`, o)

function Section({ title, count, defaultOpen = false, onEdit, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((o) => !o)
  // Non-nested pressables (title / pencil / chevron are siblings) — a Pressable
  // inside the header Pressable swallows the tap on RN Web (same fix as web).
  return (
    <Card padded={false} style={styles.sectionOuter} contentStyle={styles.section}>
      <View style={styles.secHead}>
        <Pressable style={styles.secTitleWrap} onPress={toggle}>
          <Text style={styles.secTitle}>{title}</Text>
          {count != null ? <Text style={styles.secCount}>{count}</Text> : null}
        </Pressable>
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8} style={styles.secEdit} accessibilityLabel={i18n.t('clients:drawer.edit', { defaultValue: 'ערוך' })}>
            <Pencil size={13} strokeWidth={1.6} color={colors.textSub} />
          </Pressable>
        ) : null}
        <Pressable onPress={toggle} hitSlop={8} style={styles.secChevron}>
          <ChevronDown size={16} strokeWidth={1.6} color={colors.textSub} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
        </Pressable>
      </View>
      {open ? <View style={styles.secBody}>{children}</View> : null}
    </Card>
  )
}

export default function ClientDrawerSections({ client: c, txns, tasks = [], reminders = [], sessions = [], members = [], groups = [], onEditClient, onEditTx, onEditSession, onEditTask, onEditReminder }) {
  const payments = financeQuery({ clientId: c.id, includePending: true, source: txns }).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
  const payTotal = payments.filter((f) => f.type === 'income' && isConfirmedTx(f)).reduce((s, f) => s + f.amount, 0)
  const clientSessions = live(sessions).filter((s) => s.client_id === c.id || (c.group_id && s.group_id === c.group_id)).sort((a, b) => new Date(b.date) - new Date(a.date))
  const openTasks = live(tasks).filter((t) => t.client_id === c.id && t.status !== 'done')
  const linkedReminders = live(reminders).filter((r) => r.linked_to_type === 'client' && r.linked_to_id === c.id)
  const activeReminders = linkedReminders.filter((r) => r.status === 'pending' || r.status === 'triggered')
  const memberships = getClientMemberships(c.id, members)
  const hasRecurring = c.recurring_day != null && c.recurring_time

  // timeline — merged event feed (meetings + payments + completed tasks).
  const events = []
  clientSessions.forEach((s) => events.push({ type: 'meeting', date: s.date, label: `${T('eventMeeting')}${s.num ? ' #' + s.num : ''}`, sub: s.summary || s.notes || '', edit: onEditSession && !s.group_id ? () => onEditSession(s) : null }))
  financeQuery({ clientId: c.id, source: txns }).forEach((f) => events.push({ type: 'payment', date: f.date, label: T('eventPayment', { amount: isr(f.amount) }), sub: f.desc || '', edit: onEditTx ? () => onEditTx((txns || []).find((t) => t.id === f.id) || f) : null }))
  live(tasks).filter((t) => t.client_id === c.id && t.status === 'done' && t.completed_at).forEach((t) => events.push({ type: 'task', date: t.completed_at, label: t.title, sub: '', edit: onEditTask ? () => onEditTask(t) : null }))
  events.sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <>
      <View style={styles.group}>
        <Text style={styles.groupTitle}>{T('activity')}</Text>

        <Section title={T('recurring')} onEdit={onEditClient}>
          {hasRecurring
            ? <Text style={styles.line}>{i18n.t('clients:sections.recurringLine', { day: i18n.t(`clients:form.days.${c.recurring_day}`), time: c.recurring_time }).replace(/<\/?\d>/g, '')}</Text>
            : <Text style={styles.empty}>{T('noRecurring')}</Text>}
        </Section>

        <Section title={T('sessionsTitle')} count={clientSessions.length}>
          {clientSessions.length ? clientSessions.map((s) => {
            const editable = !!onEditSession && !s.group_id
            const Row = editable ? Pressable : View
            return (
              <Row key={s.id} style={styles.sessRow} onPress={editable ? () => onEditSession(s) : undefined}>
                <View style={styles.sessHead}>
                  <Text style={styles.sessNum}>{s.num || '•'}</Text>
                  <Text style={styles.sessDate}>{fmtShortDate(s.date)}{s.group_id ? T('sessionGroup') : ''}</Text>
                  {editable ? <Pencil size={12} strokeWidth={1.6} color={colors.textFaint} /> : null}
                </View>
                {s.summary ? <Text style={styles.sessSummary}>{s.summary}</Text> : null}
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noSessions')}</Text>}
        </Section>

        <Section title={T('payments')} count={payments.length}>
          <View style={styles.paySummary}>
            <Text style={styles.paySummaryL}>{T('totalPaid')}</Text>
            <Text style={styles.paySummaryV}>{isr(payTotal)}</Text>
          </View>
          {payments.length ? payments.map((f) => {
            const Row = onEditTx ? Pressable : View
            return (
              <Row key={f.id} style={styles.row} onPress={onEditTx ? () => onEditTx((txns || []).find((t) => t.id === f.id) || f) : undefined}>
                <View style={[styles.rowDot, { backgroundColor: f.type === 'income' ? colors.positive : colors.danger }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{f.desc || T('noDesc')}</Text>
                  <Text style={styles.rowSub}>{fmtShortDate(f.date)}{f.status === 'pending' ? T('pending') : ''}</Text>
                </View>
                <Text style={styles.rowAmt}>{f.type === 'income' ? '+' : '−'}{isr(f.amount)}</Text>
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noPayments')}</Text>}
        </Section>

        <PaymentPlanSection client={c} />

        <Section title={T('openTasks')} count={openTasks.length}>
          {openTasks.length ? openTasks.map((t) => {
            const Row = onEditTask ? Pressable : View
            return (
              <Row key={t.id} style={styles.row} onPress={onEditTask ? () => onEditTask(t) : undefined}>
                <View style={[styles.rowDot, { backgroundColor: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium }]} />
                <Text style={[styles.rowTitle, styles.grow]} numberOfLines={2}>{t.title}</Text>
                {onEditTask ? <Pencil size={12} strokeWidth={1.6} color={colors.textFaint} /> : null}
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noOpenTasks')}</Text>}
        </Section>

        <Section title={T('timeline')} count={events.length}>
          {events.length ? events.slice(0, 30).map((e, i) => {
            const Row = e.edit ? Pressable : View
            return (
              <Row key={i} style={styles.tlRow} onPress={e.edit || undefined}>
                <Text style={styles.tlLabel} numberOfLines={1}>{e.label}{e.sub ? ` · ${e.sub.slice(0, 50)}` : ''}</Text>
                <Text style={styles.tlDate}>{fmtShortDate(e.date)}</Text>
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noEvents')}</Text>}
        </Section>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>{T('contactEnv')}</Text>

        <Section title={T('moreDetails')} onEdit={onEditClient}>
          {(c.address || c.birth_date) ? (
            <>
              {c.address ? <View style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{c.address}</Text><Text style={styles.rowSub}>{T('address')}</Text></View></View> : null}
              {c.birth_date ? <View style={styles.row}><View style={styles.rowBody}><Text style={styles.rowTitle}>{fmtShortDate(c.birth_date)}</Text><Text style={styles.rowSub}>{T('birthDate')}</Text></View></View> : null}
            </>
          ) : <Text style={styles.empty}>{T('noMoreDetails')}</Text>}
        </Section>

        <Section title={T('notes')} onEdit={onEditClient}>
          {c.notes ? (
            <>
              <Text style={styles.note}>{c.notes}</Text>
              {c.notes_updated_at ? <Text style={styles.noteTs}>{T('notesUpdated', { date: fmtShortDate(c.notes_updated_at) })}</Text> : null}
            </>
          ) : <Text style={styles.empty}>{T('noNotes')}</Text>}
        </Section>

        <Section title={T('reminders')} count={activeReminders.length}>
          {linkedReminders.length ? linkedReminders.map((r) => {
            const Row = onEditReminder ? Pressable : View
            return (
              <Row key={r.id} style={styles.row} onPress={onEditReminder ? () => onEditReminder(r) : undefined}>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, r.status === 'completed' && styles.done]} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.rowSub}>{fmtShortDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}</Text>
                </View>
                {onEditReminder ? <Pencil size={12} strokeWidth={1.6} color={colors.textFaint} /> : null}
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noReminders')}</Text>}
        </Section>

        <Section title={T('memberships')} count={memberships.length} onEdit={memberships.length ? onEditClient : undefined}>
          {memberships.length ? memberships.map((m) => {
            const g = groups.find((x) => x.id === m.group_id)
            const mode = g?.billing_mode || 'package'
            let sub
            if (m.total_override != null) sub = isr(m.total_override)
            else if (mode === 'per_session') sub = g?.price_per_session ? T('perSession', { price: isr(g.price_per_session) }) : T('pricePerSession')
            else if (mode === 'none') sub = T('noFixedPrice')
            else sub = `${g?.package_sessions ? T('packageSessions', { count: g.package_sessions }) : ''}${isr(g?.package_price || 0)}`
            return (
              <View key={m.id} style={styles.row}>
                <View style={[styles.rowDot, { backgroundColor: g?.color || colors.textSub }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{g ? g.name : T('groupDeleted')}</Text>
                  <Text style={styles.rowSub}>{sub}</Text>
                </View>
              </View>
            )
          }) : <Text style={styles.empty}>{T('notInGroups')}</Text>}
        </Section>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  group: { gap: 0, marginBottom: 6 },
  groupTitle: { fontSize: 11, fontWeight: '600', color: colors.textSub, letterSpacing: 0.6, marginHorizontal: 2, marginTop: 8, marginBottom: 8 },
  sectionOuter: { marginBottom: 8 },
  section: {},
  secHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  secTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13 },
  secEdit: { padding: 8 },
  secChevron: { paddingVertical: 13, paddingHorizontal: 4 },
  secTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  secCount: { fontSize: 11, fontWeight: '500', color: colors.textSub, backgroundColor: colors.fillStrong, borderRadius: 10, paddingVertical: 1, paddingHorizontal: 8, overflow: 'hidden' },
  secBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  line: { fontSize: 13, color: colors.text },
  note: { fontSize: 13, color: colors.text, lineHeight: 19 },
  noteTs: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
  empty: { fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 4 },

  sessRow: { gap: 6, paddingVertical: 4 },
  sessHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessNum: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, overflow: 'hidden', fontSize: 11, fontWeight: '500', color: colors.textSub, backgroundColor: colors.fillStrong },
  sessDate: { flex: 1, fontSize: 12, color: colors.textSub },
  sessSummary: { fontSize: 13, color: colors.text, lineHeight: 19 },

  paySummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  paySummaryL: { fontSize: 12, color: colors.textSub },
  paySummaryV: { fontSize: 13, fontWeight: '600', color: colors.text },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13, color: colors.text },
  grow: { flex: 1 },
  done: { textDecorationLine: 'line-through', color: colors.textFaint },
  rowSub: { fontSize: 11, color: colors.textFaint },
  rowAmt: { fontSize: 13, fontWeight: '600', color: colors.text },

  tlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6 },
  tlLabel: { flex: 1, fontSize: 13, color: colors.text },
  tlDate: { fontSize: 11, color: colors.textFaint },
})

Section.displayName = 'Section'
