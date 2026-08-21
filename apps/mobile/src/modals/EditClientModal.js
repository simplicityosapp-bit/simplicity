import { useState, useEffect, useRef, Children, cloneElement } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { User, CalendarDays, Wallet, Users, ChevronDown } from 'lucide-react-native'
import { isr } from '@simplicity/core'
import Sheet from '../components/Sheet'
import Select from '../components/Select'
import { useFormOptions } from '../lib/formOptions'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Edit a client — a foldable accordion mirroring the web EditClientModal:
// details / more-details / scheduling / billing (live paid+balance) / groups.
// onSave(id, patch); billing snapshot (rawPaid/memberTotal/personalHeld/
// groupSessions) comes from clientBalance so the live math matches the card.
const STATUSES = [
  { k: 'active', l: 'statusActive' },
  { k: 'wandering', l: 'statusWandering' },
  { k: 'past', l: 'statusPast' },
  { k: 'no_status', l: 'statusNone' },
]
const DAYS = [0, 1, 2, 3, 4, 5, 6]
const T = (k, o) => i18n.t(`modalsClient:editClient.${k}`, o)
const C = (k, o) => i18n.t(`modalsClient:common.${k}`, o)

const blank = (client, snap) => ({
  name: client?.name || '',
  status: client?.status_meta || client?.status || 'active',
  status_id: client?.status_id || '',
  billing_mode: client?.billing_mode || 'package',
  sessions: client?.sessions != null ? String(client.sessions) : '',
  done: String((snap.personalHeld || 0) + (Number(client?.sessions_done_adjustment) || 0)),
  price_per_session: client?.price_per_session != null ? String(client.price_per_session) : '',
  total_due: client?.total_override != null ? String(client.total_override) : '',
  paid: String((snap.rawPaid || 0) + (Number(client?.paid_adjustment) || 0)),
  adjustment: String(Number(client?.balance_adjustment) || 0),
  phone: client?.phone || '',
  email: client?.email || '',
  project_id: client?.project_id || '',
  group_id: client?.group_id || '',
  recurring_day: client?.recurring_day != null ? String(client.recurring_day) : '',
  recurring_time: client?.recurring_time || '',
  recurring_end_time: client?.recurring_end_time || '',
  meeting_type_id: client?.meeting_type_id || '',
  price_overridden: client?.price_overridden ?? false,
})

function Section({ Icon, title, summary, open, onToggle, children }) {
  return (
    <View style={[styles.acc, open && styles.accOpen]}>
      <Pressable style={styles.accHead} onPress={onToggle}>
        <Icon size={17} strokeWidth={1.7} color={colors.textSub} />
        <Text style={styles.accTitle}>{title}</Text>
        {!open && summary ? <Text style={styles.accSum} numberOfLines={1}>{summary}</Text> : null}
        <ChevronDown size={16} strokeWidth={1.8} color={colors.textSub} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open ? <View style={styles.accBody}>{children}</View> : null}
    </View>
  )
}

export default function EditClientModal({ open, onClose, onSave, client, rawPaid = 0, memberTotal = 0, personalHeld = 0, groupSessions = [], onPaidEntry, memberships = [], onUpdateMember }) {
  const { projects, groups, clientStatuses, meetingTypes } = useFormOptions()
  const snap = { rawPaid, memberTotal, personalHeld }
  const [form, setForm] = useState(() => blank(client, snap))
  const [openSecs, setOpenSecs] = useState(() => new Set(['details']))
  /* Raw text held while «יתרה» is being typed into — see setBalance. */
  const [balanceDraft, setBalanceDraft] = useState(null)
  // Per-group billing override (group_members.total_override), keyed by
  // membership id — lets the user set a member's total after the group's
  // billing mode produced a default (mirrors web EditClientModal).
  const memberDefaults = () => Object.fromEntries((memberships || []).map((m) => [m.id, m.total_override != null ? String(m.total_override) : '']))
  const [memberOverrides, setMemberOverrides] = useState(memberDefaults)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setForm(blank(client, snap)); setOpenSecs(new Set(['details'])); setMemberOverrides(memberDefaults()); setErr(''); setBusy(false) } }, [open, client?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const toggleSec = (k) => setOpenSecs((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  /* Backing out of the longest form in the app used to take ~20 filled fields
     with it, money included, without a word. The seed is re-read rather than
     snapshotted in state: `blank` is pure and the effect above already
     re-seeds from it on every open, so the two can never drift. Values are
     all primitives, so a shallow compare is enough. Saving calls onClose
     directly and bypasses this; an untouched form still closes at once. */
  const isDirty = () => {
    const seed = blank(client, snap)
    if (Object.keys(seed).some((k) => form[k] !== seed[k])) return true
    return Object.keys(memberOverrides).some((k) => memberOverrides[k] !== (memberDefaults()[k] ?? ''))
  }
  const requestClose = () => {
    if (busy || !isDirty()) { onClose(); return }
    Alert.alert(
      i18n.t('modalsSystem:discard.title'),
      i18n.t('modalsSystem:discard.message'),
      [
        { text: i18n.t('modalsSystem:discard.cancel'), style: 'cancel' },
        { text: i18n.t('modalsSystem:discard.confirm'), style: 'destructive', onPress: onClose },
      ],
    )
  }
  const pickMeetingType = (id) => {
    const type = meetingTypes.find((mt) => mt.id === id)
    setForm((f) => ({ ...f, meeting_type_id: id, price_overridden: false, price_per_session: type && type.default_price != null ? String(type.default_price) : f.price_per_session }))
  }
  const setPrice = (v) => setForm((f) => ({ ...f, price_per_session: v, price_overridden: true }))

  const subStatuses = (clientStatuses || []).filter((s) => s.meta_category === form.status)
  const isPerSession = form.billing_mode === 'per_session'
  const privatePortion = form.total_due !== ''
    ? Math.max(0, Number(form.total_due) || 0)
    : (isPerSession ? (Number(form.done) || 0) : (Number(form.sessions) || 0)) * (Number(form.price_per_session) || 0)
  const liveTotal = (Number(memberTotal) || 0) + privatePortion
  const livePaid = Number(form.paid) || 0
  const liveAdj = Number(form.adjustment) || 0
  const liveBalance = liveTotal - livePaid - liveAdj
  /* «יתרה» is the one DERIVED money field — it renders liveBalance, which is
     recomputed from `adjustment` on every keystroke. That round-trip destroys
     the states a number must pass through on the way in: "-" (an overpaid
     client) and the "." of "150.5" are not numbers yet, so Number()||0 turned
     them into 0 and the field redrew as "0" over what was being typed.
     Hold the raw text while editing and commit only once it parses; blur
     drops the draft so the field re-syncs to the derived value. Same fix as
     web. */
  const setBalance = (v) => {
    setBalanceDraft(v)
    if (v !== '' && Number.isFinite(Number(v))) set('adjustment', String(liveTotal - livePaid - Number(v)))
  }

  const statusLabel = T((STATUSES.find((s) => s.k === form.status) || STATUSES[0]).l)
  const schedSummary = form.recurring_day !== ''
    ? `${C(`day${form.recurring_day}`)}${form.recurring_time ? ` · ${form.recurring_time}` : ''}`
    : (form.meeting_type_id ? (meetingTypes.find((mt) => mt.id === form.meeting_type_id)?.name || '') : '')
  const projectHasGroups = !!form.project_id && groups.some((g) => g.project_id === form.project_id)
  const showGroups = groupSessions.length > 0 || projectHasGroups || memberships.length > 0

  const submit = async () => {
    if (!form.name.trim()) { setErr(C('nameRequired')); setOpenSecs((s) => new Set(s).add('details')); return }
    setBusy(true)
    setErr('')
    try {
      const patch = {
        name: form.name.trim(),
        status: form.status,
        status_meta: form.status,
        status_id: form.status_id || null,
        status_overridden: form.status !== client.status_meta ? true : !!client.status_overridden,
        billing_mode: form.billing_mode || 'package',
        sessions: Number(form.sessions) || 0,
        price_per_session: Number(form.price_per_session) || 0,
        total_override: form.total_due !== '' ? Math.max(0, Number(form.total_due) || 0) : null,
        has_custom_price: form.total_due !== '',
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
        recurring_time: form.recurring_day !== '' ? (form.recurring_time || null) : null,
        /* A fixed meeting needs a day; with no day the times are inert, so
           they clear with it and a stray time can never persist a half-set
           slot. */
        recurring_end_time: form.recurring_day !== '' ? (form.recurring_end_time || null) : null,
        meeting_type_id: form.meeting_type_id || null,
        price_overridden: !!form.price_overridden,
      }
      // "נעשה" manual edit → store the delta as sessions_done_adjustment.
      const nextDoneAdj = (Number(form.done) || 0) - personalHeld
      if (nextDoneAdj !== (Number(client?.sessions_done_adjustment) || 0)) patch.sessions_done_adjustment = nextDoneAdj
      // "יתרה" edit → balance_adjustment (a card-only forgiveness).
      const nextAdj = Number(form.adjustment) || 0
      if (nextAdj !== (Number(client?.balance_adjustment) || 0)) patch.balance_adjustment = nextAdj
      // "שולם" edit → hand the delta to the parent, which prompts to record a
      // real income transaction OR fold it into paid_adjustment as a card-only
      // credit (mirrors web onPaidEntry). Fall back to folding if no handler is
      // wired, so a standalone use never silently drops the change.
      const paymentDelta = (Number(form.paid) || 0) - (rawPaid + (Number(client?.paid_adjustment) || 0))
      if (!onPaidEntry && paymentDelta !== 0) patch.paid_adjustment = (Number(client?.paid_adjustment) || 0) + paymentDelta
      await onSave(client.id, patch)
      // Persist any changed per-group billing overrides (mirrors web).
      for (const m of memberships) {
        const rawv = memberOverrides[m.id]
        const next = rawv !== '' && rawv != null ? Math.max(0, Number(rawv) || 0) : null
        if (next !== (m.total_override ?? null)) {
          await onUpdateMember?.(m.id, { total_override: next, has_custom_price: next != null })
        }
      }
      // A manual "שולם" change → hand the delta to the parent to prompt record-or-fold.
      if (onPaidEntry && paymentDelta !== 0) onPaidEntry(paymentDelta)
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsClient:common.saveFailed', { error: e.message || C('tryAgain') }))
    }
  }

  /* Render nothing without a client rather than an empty titled sheet. */
  if (!client) return null

  return (
    /* The name in the title: with the client file dimmed behind the sheet and
       a body that is mostly numbers, "עריכת לקוח" alone left nothing on screen
       saying whose money is being edited. */
    <Sheet open={open} onClose={requestClose} title={client.name ? T('titleNamed', { name: client.name }) : T('title')}>
      <Section Icon={User} title={T('secDetails')} summary={statusLabel} open={openSecs.has('details')} onToggle={() => toggleSec('details')}>
        <Field label={C('name')}>
          <TextInput style={[styles.input, err && !form.name.trim() && styles.inputErr]} value={form.name} onChangeText={(v) => { set('name', v); if (err) setErr('') }} placeholderTextColor={colors.textFaint} />
          {/* The missing-name error belongs at its field, not in the footer
              four sections below it. An empty name is the only error that can
              reach that point — submit blocks on it — so anything else in
              `err` is a save failure and stays at the bottom. */}
          {err && !form.name.trim() ? <Text style={styles.error}>{err}</Text> : null}
        </Field>
        <Field label={T('status')}>
          <Pills options={STATUSES.map((s) => ({ k: s.k, label: T(s.l) }))} value={form.status} onPick={(k) => setForm((f) => ({ ...f, status: k, status_id: '' }))} />
        </Field>
        {subStatuses.length ? (
          <Select label={C('subStatusOptional')} value={form.status_id} onChange={(v) => set('status_id', v)} placeholder={C('none')}
            options={[{ value: '', label: C('none') }, ...subStatuses.map((s) => ({ value: s.id, label: `${s.icon ? s.icon + ' ' : ''}${s.display_name}` }))]} />
        ) : null}
        <View style={styles.row2}>
          <Field label={C('phone')} flex>
            <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} placeholder={C('phonePlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="phone-pad" />
          </Field>
        </View>
        <Select label={C('project')} value={form.project_id} onChange={(v) => { set('project_id', v); set('group_id', '') }} placeholder={C('none')}
          options={[{ value: '', label: C('none') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        <Field label={C('email')}>
          <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} placeholder={C('emailPlaceholder')} placeholderTextColor={colors.textFaint} keyboardType="email-address" autoCapitalize="none" />
        </Field>
        {/* Notes, address and birth date are NOT here any more. The client
            card edits all three in place through its own section pencils, so
            each has exactly one owner — carrying a second copy here meant the
            same field had two editors with two different save gestures, and
            let this sheet write over a value the card had just set. It also
            wrote `notes` without the `notes_updated_at` stamp the card prints
            beside it, so a note edited here showed fresh text under a stale
            date. Same split the web form already made. */}
      </Section>


      <Section Icon={CalendarDays} title={T('secScheduling')} summary={schedSummary} open={openSecs.has('scheduling')} onToggle={() => toggleSec('scheduling')}>
        <Select label={T('meetingType')} value={form.meeting_type_id} onChange={pickMeetingType} placeholder={C('none')}
          options={[{ value: '', label: C('none') }, ...meetingTypes.map((mt) => ({ value: mt.id, label: `${mt.name}${mt.default_price != null ? ` · ₪${mt.default_price}` : ''}` }))]} />
        <View style={styles.row2}>
          <Field label={T('fixedDay')} flex>
            <Select value={form.recurring_day} onChange={(v) => set('recurring_day', v)} placeholder={C('none')}
              options={[{ value: '', label: C('none') }, ...DAYS.map((d) => ({ value: String(d), label: C(`day${d}`) }))]} />
          </Field>
          <Field label={T('fixedTime')} flex>
            <TextInput style={styles.input} value={form.recurring_time} onChangeText={(v) => set('recurring_time', v)} placeholder="HH:MM" placeholderTextColor={colors.textFaint} />
          </Field>
        </View>
        {/* End time — the client's own slot length. It was in neither app's
            form, so a 1-on-1 slot could only ever be the calendar's 60-minute
            fallback (the day view reads duration_minutes, then the subject's
            recurring_end_time, then gives up). Groups have had it throughout. */}
        <Field label={T('fixedEndTime')}>
          <TextInput style={styles.input} value={form.recurring_end_time} onChangeText={(v) => set('recurring_end_time', v)} placeholder="HH:MM" placeholderTextColor={colors.textFaint} />
          <Text style={styles.hint}>{T('fixedEndTimeHint')}</Text>
        </Field>
        {form.recurring_day !== '' || form.recurring_time !== '' || form.recurring_end_time !== '' ? (
          <Pressable onPress={() => { set('recurring_day', ''); set('recurring_time', ''); set('recurring_end_time', '') }}><Text style={styles.clearLink}>{T('clearFixed')}</Text></Pressable>
        ) : null}
      </Section>

      <Section Icon={Wallet} title={T('secBilling')} summary={`${T('balance')} ${isr(liveBalance)}`} open={openSecs.has('billing')} onToggle={() => toggleSec('billing')}>
        <Field label={T('billingMode')}>
          <Pills options={[{ k: 'package', label: T('billingPackage') }, { k: 'per_session', label: T('billingPerSession') }]} value={form.billing_mode} onPick={(k) => set('billing_mode', k)} />
        </Field>
        {/* "נקבעו" shows in BOTH modes, as on web. It was hidden for
            per-session because it is not what bills them — but hiding it also
            removed the only way to say how many meetings are booked ahead, so
            the card reported 0 forever and the one route to a real number was
            to switch the client to package billing. */}
        <View style={styles.row2}>
          <Field label={T('scheduled')} flex>
            <TextInput style={styles.input} value={form.sessions} onChangeText={(v) => set('sessions', v)} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
          </Field>
          <Field label={T('done')} flex>
            <TextInput style={styles.input} value={form.done} onChangeText={(v) => set('done', v)} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
          </Field>
        </View>
        {isPerSession ? <Text style={styles.hint}>{T('scheduledPerSessionHint')}</Text> : null}
        <Field label={T('pricePerSession')}>
          <TextInput style={styles.input} value={form.price_per_session} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
        </Field>
        <Field label={T('totalDueOptional')}>
          <TextInput style={styles.input} value={form.total_due} onChangeText={(v) => set('total_due', v)} keyboardType="numeric" placeholder={T('totalDuePlaceholder')} placeholderTextColor={colors.textFaint} />
          <Text style={styles.hint}>{T('totalDueHint')}</Text>
        </Field>
        <Field label={T('billingCardLabel')}>
          <View style={styles.row2}>
            <Field label={T('paid')} flex>
              <TextInput style={styles.input} value={form.paid} onChangeText={(v) => set('paid', v)} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
            </Field>
            <Field label={T('balance')} flex>
              <TextInput style={styles.input} value={balanceDraft ?? String(liveBalance)} onChangeText={setBalance} onBlur={() => setBalanceDraft(null)} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
            </Field>
          </View>
          <Text style={styles.hint}>{T('billingHint', { total: isr(liveTotal) })}</Text>
        </Field>
      </Section>

      {showGroups ? (
        <Section Icon={Users} title={T('secGroups')} summary={groupSessions.length ? String(groupSessions.length) : ''} open={openSecs.has('groups')} onToggle={() => toggleSec('groups')}>
          {projectHasGroups ? (
            <Select label={C('groupOptional')} value={form.group_id} onChange={(v) => set('group_id', v)} placeholder={T('noGroup')}
              options={[{ value: '', label: T('noGroup') }, ...groups.filter((g) => g.project_id === form.project_id).map((g) => ({ value: g.id, label: g.name }))]} />
          ) : null}
          {groupSessions.map((gs) => (
            <View key={gs.id} style={styles.grpRow}>
              <Text style={styles.grpName}>{T('groupSessions', { name: gs.name })}</Text>
              <Text style={styles.grpVal}>{T('groupSessionsVal', { held: gs.held, quota: gs.quota || 0 })}</Text>
            </View>
          ))}
          {memberships.length > 0 ? (
            <View style={styles.perGroup}>
              <Text style={styles.label}>{T('perGroupBilling')}</Text>
              {memberships.map((m) => {
                const g = groups.find((x) => x.id === m.group_id)
                return (
                  <View key={m.id} style={styles.perGroupRow}>
                    <Text style={styles.perGroupName} numberOfLines={1}>{g?.name || T('groupFallback')}</Text>
                    <TextInput
                      style={[styles.input, styles.perGroupInput]}
                      value={memberOverrides[m.id] ?? ''}
                      onChangeText={(v) => setMemberOverrides((o) => ({ ...o, [m.id]: v }))}
                      placeholder={T('perGroupPlaceholder')}
                      placeholderTextColor={colors.textFaint}
                      keyboardType="numeric"
                    />
                  </View>
                )
              })}
              <Text style={styles.hint}>{T('perGroupHint')}</Text>
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* Save failures only — the name error is rendered at its own field. */}
      {err && !!form.name.trim() ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={requestClose}><Text style={styles.cancelText}>{C('cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? C('saving') : C('save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

/* Tapping the LABEL puts the cursor in the field under it, the way the web
   form does with htmlFor. There is no such binding in React Native, so the
   label is a Pressable and the child input is handed a ref to focus.

   Only a single child that takes a ref can be focused — a Select or a pills
   row is not a text field and gets no ref, so its label simply does nothing
   rather than throwing. Any ref the caller already put on the child is kept
   and called alongside ours. */
function Field({ label, flex, children }) {
  const inputRef = useRef(null)
  const only = Children.count(children) === 1 ? Children.only(children) : null
  const focusable = only && only.type === TextInput
  const child = focusable
    ? cloneElement(only, {
      ref: (node) => {
        inputRef.current = node
        const r = only.ref
        if (typeof r === 'function') r(node)
        else if (r && typeof r === 'object') r.current = node
      },
    })
    : children
  const labelNode = label ? <Text style={styles.label}>{label}</Text> : null
  return (
    <View style={[styles.field, flex && styles.fieldFlex]}>
      {labelNode && focusable
        ? <Pressable onPress={() => inputRef.current?.focus()} accessibilityRole="none">{labelNode}</Pressable>
        : labelNode}
      {child}
    </View>
  )
}
function Pills({ options, value, onPick }) {
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const on = value === o.k
        return (
          <Pressable key={o.k} style={[styles.pill, on && styles.pillOn]} onPress={() => onPick(o.k)}>
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  acc: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  accOpen: { borderColor: colors.brand },
  accHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14 },
  accTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  accSum: { flex: 1, textAlign: 'right', fontSize: 12, color: colors.textFaint },
  accBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 12 },

  field: { gap: 6 },
  fieldFlex: { flex: 1 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  row2: { flexDirection: 'row', gap: 12 },
  hint: { fontSize: 11, color: colors.textFaint },
  clearLink: { fontSize: 13, color: colors.brand, fontWeight: '500' },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, color: colors.textSub },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },

  grpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  grpName: { fontSize: 13, color: colors.text },
  grpVal: { fontSize: 13, color: colors.textSub },
  perGroup: { gap: 8, marginTop: 8 },
  perGroupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perGroupName: { flex: 1, fontSize: 13, color: colors.text },
  perGroupInput: { flex: 1 },

  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBtn },
})

Section.displayName = 'Section'
Field.displayName = 'Field'
Pills.displayName = 'Pills'
