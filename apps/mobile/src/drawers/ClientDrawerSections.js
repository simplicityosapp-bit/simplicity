import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, I18nManager } from 'react-native'
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

function Section({ title, count, defaultOpen = false, onEdit, editing = false, inline = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  /* Entering edit mode latches the section OPEN. Without it the pencil on a
     collapsed section armed an editor that rendered into a hidden body — a
     tap that did nothing at all. Adjusted during render rather than in an
     effect, the pattern web uses for the same latch. */
  const [prevEditing, setPrevEditing] = useState(editing)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    if (editing) setOpen(true)
  }
  const isOpen = open || editing
  /* Inert while editing: isOpen is forced true then, so a toggle tap looked
     like a no-op but still flipped `open` to false underneath — and the
     section snapped shut the moment the save landed, hiding the value just
     written, which is exactly what the latch above exists to prevent. */
  const toggle = () => { if (!editing) setOpen((o) => !o) }
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
  // Non-nested pressables (title / pencil / chevron are siblings) — a Pressable
  // inside the header Pressable swallows the tap on RN Web (same fix as web).
  return (
    <Card padded={false} style={styles.sectionOuter} contentStyle={styles.section}>
      <View style={[styles.secHead, flip && styles.rowFlip]}>
        <Pressable style={styles.secTitleWrap} onPress={toggle}>
          <Text style={[styles.secTitle, flip && styles.txtRtl]}>{title}</Text>
          {count != null ? <Text style={styles.secCount}>{count}</Text> : null}
        </Pressable>
        {onEdit && !(inline && editing) ? (
          <Pressable onPress={onEdit} hitSlop={8} style={styles.secEdit} accessibilityLabel={i18n.t('clients:drawer.edit', { defaultValue: 'ערוך' })}>
            <Pencil size={13} strokeWidth={1.6} color={colors.textSub} />
          </Pressable>
        ) : null}
        <Pressable onPress={toggle} hitSlop={8} style={styles.secChevron}>
          <ChevronDown size={16} strokeWidth={1.6} color={colors.textSub} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
        </Pressable>
      </View>
      {isOpen ? <View style={styles.secBody}>{children}</View> : null}
    </Card>
  )
}

/* The buttons under an open inline editor. Mirrors web's InlineForm: the
   fields come in as children so they reconcile normally and keep focus
   while you type. */
function InlineForm({ onSave, onCancel, saving, error, children }) {
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
  return (
    <View style={styles.inline}>
      {children}
      {error ? <Text style={[styles.inlineErr, flip && styles.txtRtl]}>{error}</Text> : null}
      <View style={[styles.inlineActions, flip && styles.rowFlip]}>
        <Pressable onPress={onCancel} disabled={saving} hitSlop={6} style={styles.inlineBtn}>
          <Text style={styles.inlineCancel}>{i18n.t('clients:inline.cancel')}</Text>
        </Pressable>
        <Pressable onPress={onSave} disabled={saving} hitSlop={6} style={[styles.inlineBtn, styles.inlineBtnSave]}>
          <Text style={styles.inlineSave}>{saving ? i18n.t('clients:inline.saving') : i18n.t('clients:inline.save')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function ClientDrawerSections({ client: c, txns, tasks = [], reminders = [], sessions = [], members = [], groups = [], onEditClient, onEditTx, onEditSession, onEditTask, onEditReminder, onUpdateClient }) {
  /* ── inline single-value editing ──
     «פרטים נוספים» and «הערות» handed their pencil straight to the full edit
     modal — the same thing the header's «ערוך» button does — so one pencil
     icon meant two different things depending on which section it sat in.
     They edit their own fields in place now, exactly as they already do on
     web, which is also what lets the edit FORM stop carrying a second copy
     of the same three fields.
     Sections whose content is not a single value (sessions, payments, the
     membership price table) keep sending you to the modal. */
  const [inlineKey, setInlineKey] = useState(null)
  /* Mirrors inlineKey so a save that lands late can tell whether the user has
     since moved to a different editor — the value captured in that closure is
     stale by then. */
  const inlineKeyRef = useRef(null)
  useEffect(() => { inlineKeyRef.current = inlineKey }, [inlineKey])
  const [draft, setDraft] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const closeInline = () => { setInlineKey(null); setDraft({}); setSaving(false); setSaveErr('') }
  const toggleInline = (k, seed) => {
    if (inlineKey === k) { closeInline(); return }
    setInlineKey(k); setDraft(seed); setSaving(false); setSaveErr('')
  }
  const saveInline = async (patch) => {
    if (saving) return
    const forKey = inlineKeyRef.current
    setSaving(true)
    setSaveErr('')
    try {
      await onUpdateClient?.(c.id, patch)
      setSaving(false)
      /* Only act if this editor is still the open one — a slow save landing
         after the user switched must not close, or error onto, the new one. */
      if (inlineKeyRef.current === forKey) { setInlineKey(null); setDraft({}) }
    } catch {
      setSaving(false)
      if (inlineKeyRef.current === forKey) setSaveErr(i18n.t('clients:inline.saveFailed'))
    }
  }

  // Manual RTL flip for the LTR-engine Hebrew state (no-op on a real RTL device):
  // put leading dots/nums on the right, trailing dates/amounts on the left, and
  // right-align labels.
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
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
                <View style={[styles.sessHead, flip && styles.rowFlip]}>
                  <Text style={styles.sessNum}>{s.num || '•'}</Text>
                  <Text style={[styles.sessDate, flip && styles.txtRtl]}>{fmtShortDate(s.date)}{s.group_id ? T('sessionGroup') : ''}</Text>
                  {editable ? <Pencil size={12} strokeWidth={1.6} color={colors.textFaint} /> : null}
                </View>
                {s.summary ? <Text style={[styles.sessSummary, flip && styles.txtRtl]}>{s.summary}</Text> : null}
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noSessions')}</Text>}
        </Section>

        <Section title={T('payments')} count={payments.length}>
          <View style={[styles.paySummary, flip && styles.rowFlip]}>
            <Text style={styles.paySummaryL}>{T('totalPaid')}</Text>
            <Text style={styles.paySummaryV}>{isr(payTotal)}</Text>
          </View>
          {payments.length ? payments.map((f) => {
            const Row = onEditTx ? Pressable : View
            return (
              <Row key={f.id} style={[styles.row, flip && styles.rowFlip]} onPress={onEditTx ? () => onEditTx((txns || []).find((t) => t.id === f.id) || f) : undefined}>
                <View style={[styles.rowDot, { backgroundColor: f.type === 'income' ? colors.positive : colors.danger }]} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, flip && styles.txtRtl]} numberOfLines={1}>{f.desc || T('noDesc')}</Text>
                  <Text style={[styles.rowSub, flip && styles.txtRtl]}>{fmtShortDate(f.date)}{f.status === 'pending' ? T('pending') : ''}</Text>
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
              <Row key={t.id} style={[styles.row, flip && styles.rowFlip]} onPress={onEditTask ? () => onEditTask(t) : undefined}>
                <View style={[styles.rowDot, { backgroundColor: PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium }]} />
                <Text style={[styles.rowTitle, styles.grow, flip && styles.txtRtl]} numberOfLines={2}>{t.title}</Text>
                {onEditTask ? <Pencil size={12} strokeWidth={1.6} color={colors.textFaint} /> : null}
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noOpenTasks')}</Text>}
        </Section>

        <Section title={T('timeline')} count={events.length}>
          {events.length ? events.slice(0, 30).map((e, i) => {
            const Row = e.edit ? Pressable : View
            return (
              <Row key={i} style={[styles.tlRow, flip && styles.rowFlip]} onPress={e.edit || undefined}>
                <Text style={[styles.tlLabel, flip && styles.txtRtl]} numberOfLines={1}>{e.label}{e.sub ? ` · ${e.sub.slice(0, 50)}` : ''}</Text>
                <Text style={styles.tlDate}>{fmtShortDate(e.date)}</Text>
              </Row>
            )
          }) : <Text style={styles.empty}>{T('noEvents')}</Text>}
        </Section>
      </View>

      <View style={styles.group}>
        <Text style={styles.groupTitle}>{T('contactEnv')}</Text>

        <Section
          title={T('moreDetails')}
          editing={inlineKey === 'more'}
          inline
          onEdit={onUpdateClient ? () => toggleInline('more', { address: c.address || '', birth_date: c.birth_date || '' }) : onEditClient}
        >
          {inlineKey === 'more' ? (
            <InlineForm
              saving={saving}
              error={saveErr}
              onCancel={closeInline}
              onSave={() => saveInline({
                address: (draft.address || '').trim() || null,
                birth_date: draft.birth_date || null,
              })}
            >
              <Text style={[styles.inlineLabel, flip && styles.txtRtl]}>{T('address')}</Text>
              <TextInput
                style={[styles.inlineInput, flip && styles.txtRtl]}
                value={draft.address || ''}
                onChangeText={(v) => setField('address', v)}
                placeholder={i18n.t('clients:form.addressPlaceholder', { defaultValue: '' })}
                placeholderTextColor={colors.textFaint}
              />
              <Text style={[styles.inlineLabel, flip && styles.txtRtl]}>{T('birthDate')}</Text>
              <TextInput
                style={[styles.inlineInput, flip && styles.txtRtl]}
                value={draft.birth_date || ''}
                onChangeText={(v) => setField('birth_date', v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textFaint}
              />
            </InlineForm>
          ) : (c.address || c.birth_date) ? (
            <>
              {c.address ? <View style={[styles.row, flip && styles.rowFlip]}><View style={styles.rowBody}><Text style={[styles.rowTitle, flip && styles.txtRtl]}>{c.address}</Text><Text style={[styles.rowSub, flip && styles.txtRtl]}>{T('address')}</Text></View></View> : null}
              {c.birth_date ? <View style={[styles.row, flip && styles.rowFlip]}><View style={styles.rowBody}><Text style={[styles.rowTitle, flip && styles.txtRtl]}>{fmtShortDate(c.birth_date)}</Text><Text style={[styles.rowSub, flip && styles.txtRtl]}>{T('birthDate')}</Text></View></View> : null}
            </>
          ) : <Text style={styles.empty}>{T('noMoreDetails')}</Text>}
        </Section>

        <Section
          title={T('notes')}
          editing={inlineKey === 'notes'}
          inline
          onEdit={onUpdateClient ? () => toggleInline('notes', { notes: c.notes || '' }) : onEditClient}
        >
          {inlineKey === 'notes' ? (
            <InlineForm
              saving={saving}
              error={saveErr}
              onCancel={closeInline}
              onSave={() => {
                const next = (draft.notes || '').trim() || null
                const patch = { notes: next }
                /* The section prints "עודכן ב-…" from this column, so the
                   stamp has to move with the text or the card shows a fresh
                   note under a stale date. Only when the text actually
                   changed — reopening and saving an untouched note must not
                   claim it was rewritten today. */
                if (next !== (c.notes ?? null)) patch.notes_updated_at = new Date().toISOString()
                return saveInline(patch)
              }}
            >
              <TextInput
                style={[styles.inlineInput, styles.inlineArea, flip && styles.txtRtl]}
                value={draft.notes || ''}
                onChangeText={(v) => setField('notes', v)}
                multiline
                placeholder={i18n.t('clients:inline.notesPlaceholder')}
                placeholderTextColor={colors.textFaint}
              />
            </InlineForm>
          ) : c.notes ? (
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
              <Row key={r.id} style={[styles.row, flip && styles.rowFlip]} onPress={onEditReminder ? () => onEditReminder(r) : undefined}>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, r.status === 'completed' && styles.done]} numberOfLines={1}>{r.title}</Text>
                  <Text style={[styles.rowSub, flip && styles.txtRtl]}>{fmtShortDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}</Text>
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
              <View key={m.id} style={[styles.row, flip && styles.rowFlip]}>
                <View style={[styles.rowDot, { backgroundColor: g?.color || colors.textSub }]} />
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, flip && styles.txtRtl]} numberOfLines={1}>{g ? g.name : T('groupDeleted')}</Text>
                  <Text style={[styles.rowSub, flip && styles.txtRtl]}>{sub}</Text>
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
  inline: { gap: 8 },
  inlineLabel: { fontSize: 11, color: colors.textSub },
  inlineInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    fontSize: 13,
    color: colors.text,
  },
  inlineArea: { minHeight: 88, textAlignVertical: 'top' },
  inlineErr: { fontSize: 12, color: colors.danger },
  inlineActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  inlineBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12 },
  inlineBtnSave: { backgroundColor: colors.btnBg },
  inlineCancel: { fontSize: 13, color: colors.textSub },
  /* btnBg/onBtn, NOT brand/onBrand: brand becomes Misted Sage at night and
     a white glyph on it is the low-contrast trap the web side already has a
     separate primary-button token for. This pair is that token. */
  inlineSave: { fontSize: 13, color: colors.onBtn },
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
  rowFlip: { flexDirection: 'row-reverse' },
  txtRtl: { textAlign: 'right' },
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
