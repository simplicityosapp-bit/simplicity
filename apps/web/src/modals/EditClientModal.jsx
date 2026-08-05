import { useState } from 'react'
import { User, CalendarDays, Wallet, Users, ChevronDown } from 'lucide-react'
import Modal from './Modal'
import MeetingTypesModal from './MeetingTypesModal'
import ConfirmModal from './ConfirmModal'
import { isr } from '@simplicity/core'
import { useMeetingTypes } from '../hooks/useMeetingTypes'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

const STATUSES = [
  { k: 'active', l: 'statusActive' },
  { k: 'wandering', l: 'statusWandering' },
  { k: 'past', l: 'statusPast' },
  { k: 'no_status', l: 'statusNone' },
]
const DAYS = [0, 1, 2, 3, 4, 5, 6]

/* A foldable section of the form. Module-level (stable identity) so the
   inputs in its body never remount on a parent re-render — typing keeps
   focus. Closed sections render no body (also keeps them out of the
   modal's Tab focus-trap); the chevron rotates via the .open class. */
function Section({ icon, title, summary, open, onToggle, children }) {
  return (
    <Box className={`ec-acc${open ? ' open' : ''}`}>
      <Btn type="button" className="ec-acc-head" onClick={onToggle} aria-expanded={open}>
        <Txt className="ec-acc-ic" aria-hidden="true">{icon}</Txt>
        <Txt className="ec-acc-title">{title}</Txt>
        {!open && summary ? <Txt className="ec-acc-sum">{summary}</Txt> : null}
        <ChevronDown size={16} strokeWidth={1.8} className="ec-acc-chev" aria-hidden="true" />
      </Btn>
      {open && <Box className="ec-acc-body">{children}</Box>}
    </Box>
  )
}

/* Edit a client — name / status / sub-status / phone / project / email, the
   fixed-meeting slot, billing, and groups. Parent passes key={client?.id} so
   this remounts cleanly per client. The fields are grouped into foldable
   sections so the form reads top-down instead of as one long scroll.

   Notes, address and birth date are deliberately NOT here. The client file
   edits all three in place through its own section pencils (see the inline
   editors in ClientDrawerSections), which makes that the one place they are
   owned. Carrying a second copy here meant the same field had two editors
   with two different save gestures, and left the modal able to write over a
   value the file had just set. What is left in this modal is what the file
   has no in-place editor for: identity, the slot, the billing numbers, and
   the per-group price table. */
export default function EditClientModal({ open, onClose, onSave, client, projects = [], groups = [], statuses = [], memberships = [], onUpdateMember, onPaidEntry, onBalanceEntry, rawPaid = 0, memberTotal = 0, personalHeld = 0, groupSessions = [] }) {
  const { t } = useT('modalsClient')
  const { t: ts } = useT('modalsSystem') // shared modal chrome (discard prompt)
  /* Per-group billing override (group_members.total_override) — keyed by
     membership id. Lets the user manually set a member's total after the
     group's billing mode produced a default. */
  const [memberOverrides, setMemberOverrides] = useState(() =>
    Object.fromEntries((memberships || []).map((m) => [m.id, m.total_override != null ? String(m.total_override) : ''])),
  )
  const [form, setForm] = useState(() => ({
    name: client?.name || '',
    /* status_meta is canonical; `status` is a legacy mirror the client drawer
       did not rewrite, so seeding from it showed a stale pill — and the
       status_overridden check on save then read that stale value as a
       deliberate change, silently reverting the drawer's status. */
    status: client?.status_meta || client?.status || 'active',
    status_id: client?.status_id || '',
    billing_mode: client?.billing_mode || 'package',
    sessions: client?.sessions ?? '',
    /* "נעשה" = real private held + manual sessions_done_adjustment. */
    done: String(personalHeld + (Number(client?.sessions_done_adjustment) || 0)),
    price_per_session: client?.price_per_session ?? '',
    total_due: client?.total_override != null ? String(client.total_override) : '',
    /* "שולם" = real income + informal paid_adjustment (from past "התעלם").
       "adjustment" = the balance forgiveness that lowers "יתרה". */
    paid: String(rawPaid + (Number(client?.paid_adjustment) || 0)),
    adjustment: String(Number(client?.balance_adjustment) || 0),
    phone: client?.phone || '',
    email: client?.email || '',
    project_id: client?.project_id || '',
    group_id: client?.group_id || '',
    recurring_day: client?.recurring_day != null ? String(client.recurring_day) : '',
    recurring_time: client?.recurring_time || '',
    recurring_end_time: client?.recurring_end_time || '',
    recurring_start_date: client?.recurring_start_date || '',
    recurring_end_date: client?.recurring_end_date || '',
    meeting_type_id: client?.meeting_type_id || '',
    price_overridden: client?.price_overridden ?? false,
  }))
  /* Frozen copies of the seed. useState ignores its argument after the first
     render, so these permanently hold the form and the overrides exactly as
     they were seeded from the client. Compared SHALLOWLY — every value in both
     is a primitive — so a field added to the seed later is covered here
     automatically instead of having to be remembered in a hand-written list. */
  const [seededForm] = useState(form)
  const [seededOverrides] = useState(memberOverrides)
  const formDirty = Object.keys(form).some((k) => form[k] !== seededForm[k])
    || Object.keys(memberOverrides).some((k) => memberOverrides[k] !== seededOverrides[k])
  /* The longest form in the app sat behind an unguarded overlay: one tap
     beside the sheet, or Escape, and ~20 fields — including money — went with
     it, silently. Escape / the overlay / the X / «ביטול» all come through here
     now; saving calls onClose directly and bypasses it. An untouched form
     still closes immediately. */
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const requestClose = () => { if (formDirty) setConfirmDiscard(true); else onClose() }
  /* Raw text held while «יתרה» is being typed into — see onBalanceInput. */
  const [balanceDraft, setBalanceDraft] = useState(null)
  const { types: meetingTypes, refetch: refetchMeetingTypes } = useMeetingTypes()
  const [manageTypes, setManageTypes] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* Which sections are open — only "details" starts open. */
  const [openSecs, setOpenSecs] = useState(() => new Set(['details']))
  const toggleSec = (k) => setOpenSecs((s) => {
    const n = new Set(s)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMeta = (k) => setForm((f) => ({ ...f, status: k, status_id: '' }))
  /* Name of the group a project change just detached, or '' — drives the note
     under the project select. Cleared as soon as a group is chosen again. */
  const [droppedGroup, setDroppedGroup] = useState('')
  const changeProject = (id) => {
    setDroppedGroup(form.group_id ? (groups.find((g) => g.id === form.group_id)?.name || '') : '')
    setForm((f) => ({ ...f, project_id: id, group_id: '' }))
  }
  /* Picking a type auto-fills price_per_session from its default and re-attaches
     the price to the type; a hand-edited price detaches it (price_overridden). */
  const pickMeetingType = (id) => {
    const type = meetingTypes.find((mt) => mt.id === id)
    setForm((f) => ({
      ...f,
      meeting_type_id: id,
      price_overridden: false,
      price_per_session: type && type.default_price != null ? String(type.default_price) : f.price_per_session,
    }))
  }
  const setPrice = (v) => setForm((f) => ({ ...f, price_per_session: v, price_overridden: true }))

  /* No client → render nothing. This used to return a Modal with a title and
     an X and no body at all: an empty dialog is strictly worse than none.
     Unreachable in practice (the drawer only opens this with a client, and it
     can't close underneath an open modal), so nothing is lost by the guard
     going quiet — the real close path keeps its animation, because `client` is
     still set while `open` flips to false. */
  if (!client) return null
  const subStatuses = statuses.filter((s) => s.meta_category === form.status)

  /* Live billing snapshot — mirrors the card. Billing is per-client: the
     group dues (memberTotal, 0 for non-members) PLUS the private portion
     (total_override when set — incl. an explicit 0 for "free" — else by
     billing_mode: package = sessions × price, per_session = held × price;
     migration 0014). The editable "שולם"/"יתרה" are two views of it. */
  const isPerSession = form.billing_mode === 'per_session'
  const totalDueFormula = t(isPerSession ? 'editClient.totalDueFormulaPerSession' : 'editClient.totalDueFormulaPackage')
  /* The private portion under a GIVEN mode, so the two can be compared. A
     manual total_override wins in both, which is exactly the case where
     switching changes nothing — worth being able to say so. */
  const portionUnder = (perSess) => (form.total_due !== ''
    ? Math.max(0, Number(form.total_due) || 0)
    : (perSess ? (Number(form.done) || 0) : (Number(form.sessions) || 0)) * (Number(form.price_per_session) || 0))
  const privatePortion = portionUnder(isPerSession)
  const liveTotal = (Number(memberTotal) || 0) + privatePortion
  const livePaid = Number(form.paid) || 0
  const liveAdj = Number(form.adjustment) || 0
  const liveBalance = liveTotal - livePaid - liveAdj
  /* Switching the mode re-bills the client, and the note above the pills only
     said THAT it would — a client on 12 scheduled, 3 held and ₪380 moves by
     ₪3,420, and the coach met that number only after saving. Same arithmetic
     the card uses, run against both modes, so what is promised here is what
     the card will show. */
  const savedPerSession = (client?.billing_mode || 'package') === 'per_session'
  const balanceUnder = (perSess) => ((Number(memberTotal) || 0) + portionUnder(perSess)) - livePaid - liveAdj
  const modeChanged = form.billing_mode !== (client?.billing_mode || 'package')
  const balanceBefore = balanceUnder(savedPerSession)
  const balanceAfter = liveBalance
  /* Editing "יתרה" moves the forgiveness (adjustment) — "שולם" stays put.
     «יתרה» is the one DERIVED money field: it renders liveBalance, which is
     recomputed from `adjustment` on every keystroke. That round-trip used to
     destroy the intermediate states a number has to pass through. A number
     input reports value="" while its text is not yet a valid number, so
     typing "-" (an overpaid client) or the "." of "150.5" fed `Number('')||0`
     → 0 → the field re-rendered as "0" over what was being typed, and
     clearing the field snapped it to 0 instead of leaving it be.
     So: hold the raw text while editing and commit ONLY once it parses.
     While it doesn't, the rendered value stays "" — which matches what the
     input already holds, so React leaves the DOM alone and the half-typed
     text survives. Blur drops the draft and the field re-syncs to the
     derived value. */
  const onBalanceInput = (v) => {
    setBalanceDraft(v)
    if (v !== '' && Number.isFinite(Number(v))) set('adjustment', String(liveTotal - livePaid - Number(v)))
  }

  /* Collapsed-header summaries (live values). The status line carries the
     sub-status too when one is picked — it's the more specific of the two, and
     a closed section that reported only "פעיל׌" hid the very field the user
     had just set. */
  const pickedSub = form.status_id ? statuses.find((s) => s.id === form.status_id) : null
  const metaLabel = t(`editClient.${(STATUSES.find((s) => s.k === form.status) || STATUSES[0]).l}`)
  /* Sub-statuses are named by the user, and naming one after its own category
     ("פעיל" under פעיל) is the obvious thing to do — appending it blindly then
     reads "פעיל׌ · פעיל׌", which looks like a rendering fault rather than a
     summary. Only append when it actually adds a word. */
  const statusLabel = pickedSub && pickedSub.display_name !== metaLabel
    ? `${metaLabel} · ${pickedSub.display_name}`
    : metaLabel
  /* How far the hand-edited "בוצעו" sits from what the app actually recorded.
     The difference is stored as sessions_done_adjustment, and nothing on
     screen used to say so — the number simply took, with a silent correction
     filed behind it. Non-zero only while the two disagree. */
  const doneDelta = (Number(form.done) || 0) - personalHeld
  const schedSummary = form.recurring_day !== ''
    ? `${t(`common.day${form.recurring_day}`)}${form.recurring_time ? ` · ${form.recurring_time}` : ''}`
    : (form.meeting_type_id ? (meetingTypes.find((mt) => mt.id === form.meeting_type_id)?.name || '') : '')
  const billingSummary = `${t('editClient.balance')} ${isr(liveBalance)}`
  const groupsSummary = memberships.length > 0 ? String(memberships.length) : ''
  const projectHasGroups = !!form.project_id && groups.some((g) => g.project_id === form.project_id)
  const showGroupsSection = memberships.length > 0 || groupSessions.length > 0 || projectHasGroups

  const doSubmit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      const patch = {
        name: form.name.trim(),
        status: form.status,
        status_meta: form.status,
        status_id: form.status_id || null,
        /* Editing the status by hand is a manual override that wins over the
           client's group(s) (migration 0062). Only flip the flag when the
           status actually changed — saving the modal without touching the
           status must never silently override a still-group-driven client.
           A no-change save preserves whatever override state already exists. */
        status_overridden: form.status !== client.status_meta ? true : !!client.status_overridden,
        billing_mode: form.billing_mode || 'package',
        sessions: Number(form.sessions) || 0,
        price_per_session: Number(form.price_per_session) || 0,
        /* Manual "total due" overrides the auto-calc (sessions × price).
           An explicit 0 is kept (a deliberate "free" private total); only an
           empty field falls back to the automatic calculation. */
        total_override: form.total_due !== '' ? Math.max(0, Number(form.total_due) || 0) : null,
        has_custom_price: form.total_due !== '',
        phone: form.phone.trim() || null,
        email: form.email?.trim() || null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
        /* A fixed meeting needs a day; with no day the times are inert — drop
           them so a stray time can never persist a half-set meeting. */
        recurring_time: form.recurring_day !== '' ? (form.recurring_time || null) : null,
        recurring_end_time: form.recurring_day !== '' ? (form.recurring_end_time || null) : null,
        /* The dates hang off the same slot, so they clear with it. «ניקוי
           פגישה קבועה» used to drop the day and both times and leave these
           behind — a start date for a series that no longer exists. Nothing
           writes them without a day (ScheduleMeetingModal sets the two
           together), so gating them on the day can't strand a date either. */
        recurring_start_date: form.recurring_day !== '' ? (form.recurring_start_date || null) : null,
        recurring_end_date: form.recurring_day !== '' ? (form.recurring_end_date || null) : null,
        meeting_type_id: form.meeting_type_id || null,
        price_overridden: !!form.price_overridden,
      }
      /* "נעשה" manual edit → store the delta as sessions_done_adjustment;
         only when it actually changes, so it never depends on migration
         0011 existing. ("נקבע" is just form.sessions, saved above.) */
      const nextDoneAdj = (Number(form.done) || 0) - personalHeld
      const prevDoneAdj = Number(client?.sessions_done_adjustment) || 0
      if (nextDoneAdj !== prevDoneAdj) patch.sessions_done_adjustment = nextDoneAdj
      /* No notes / address / birth-date here any more, and so no
         notes_updated_at stamp either — the client file edits all three in
         place, and its notes editor keeps that stamp. See the note above the
         component. */
      /* Billing edits are handled INDEPENDENTLY — "שולם" and "יתרה" can both
         change in one save and neither is discarded:
         - "יתרה" → balance_adjustment (a forgiveness that only affects the
           client card; needs migration 0010).
         - "שולם" → a real payment → after saving, prompt the parent to record
           a finance transaction (handled below); never written as adjustment.
         Each is included ONLY when it actually changes, so a normal edit never
         depends on migrations 0010/0012 existing. */
      const prevAdj = Number(client?.balance_adjustment) || 0
      const nextAdj = Number(form.adjustment) || 0
      /* NOT written into the patch any more. A changed «יתרה» is a real
         adjustment, so it goes through the adjustment sheet (which moves the
         same balance_adjustment column AND records why — migration 0095).
         Writing it here too would double-apply it. */
      const balanceDelta = nextAdj - prevAdj
      const nextPaid = Number(form.paid) || 0
      /* delta vs the currently-shown "שולם" (= real income + informal adj). */
      const paymentDelta = nextPaid - (rawPaid + (Number(client?.paid_adjustment) || 0))
      await onSave(client.id, patch)
      /* Persist any changed per-group billing overrides. */
      for (const m of memberships) {
        const raw = memberOverrides[m.id]
        const next = raw !== '' && raw != null ? Math.max(0, Number(raw) || 0) : null
        if (next !== (m.total_override ?? null)) {
          await onUpdateMember?.(m.id, { total_override: next, has_custom_price: next != null })
        }
      }
      /* Hand any manual money change to the parent, which opens the adjustment
         sheet so it lands in the ledger with a reason. BOTH are handed over
         when both changed: a discount given and cash received are two separate
         events with two different reasons, and neither is written into the
         patch above — so the `else if` that used to sit here didn't "prefer"
         «שולם», it silently threw the «יתרה» edit away. The parent queues them
         and runs the sheets in order. «שולם» goes first: it's the one claiming
         money actually moved. */
      if (paymentDelta !== 0) onPaidEntry?.(paymentDelta)
      if (balanceDelta !== 0) onBalanceEntry?.(balanceDelta)
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  /* Save button. Editing "יתרה" only adjusts the client card, so it saves
     straight through — the only prompt is the finance "record a transaction?"
     one, raised after save (by the parent) when "שולם" changed. A missing name
     re-opens "details" so the error ring is visible even if collapsed. */
  const submit = () => {
    if (!form.name.trim()) {
      setErr(t('common.nameRequired'))
      setOpenSecs((s) => new Set(s).add('details'))
      return
    }
    doSubmit()
  }

  return (
    <>
    {/* Named title. With the client file dimmed behind the overlay and a body
        that is mostly numbers, a bare "עריכת לקוח" left nothing on screen
        saying WHOSE money is being edited. Deliberately not truncated: a long
        name wraps the header onto a second line, which costs nothing, where
        an ellipsis would hide the one thing the title is here to say. */}
    <Modal open={open} onClose={requestClose} title={client.name ? t('editClient.titleNamed', { name: client.name }) : t('editClient.title')}>
      <Section
        icon={<User size={17} strokeWidth={1.7} />}
        title={t('editClient.secDetails')}
        summary={statusLabel}
        open={openSecs.has('details')}
        onToggle={() => toggleSec('details')}
      >
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.name')}</Box>
          <Input
            className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
            value={form.name}
            onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
            aria-label={t('common.name')}
          />
          {/* The missing-name error belongs HERE, not in the footer four
              sections below it, where the reader had a red ring on one field
              and the sentence explaining it somewhere off-screen. An empty
              name is the only error that can reach this point — submit blocks
              on it, so anything else in `err` is a save failure and stays at
              the bottom with the buttons. */}
          {err && !form.name.trim() && <Txt as="p" className="m-error">{err}</Txt>}
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.status')}</Box>
          <Box className="m-pills">
            {STATUSES.map((s) => (
              <Btn key={s.k} type="button" className={`m-pill${form.status === s.k ? ' on' : ''}`} onClick={() => setMeta(s.k)}>{t(`editClient.${s.l}`)}</Btn>
            ))}
          </Box>
        </Box>
        {subStatuses.length > 0 && (
          <Box className="m-field">
            <Box as="label" className="m-label">{t('common.subStatusOptional')}</Box>
            <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}aria-label={t('common.subStatusOptional')} >
              <option value="">{t('common.none')}</option>
              {subStatuses.map((s) => <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>)}
            </select>
          </Box>
        )}
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('common.phone')}</Box>
            <Input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t('common.phonePlaceholder')} aria-label={t('common.phone')} />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('common.project')}</Box>
            <select className="m-select" value={form.project_id} onChange={(e) => changeProject(e.target.value)}aria-label={t('common.project')} >
              <option value="">{t('common.none')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {/* A group belongs to exactly one project, so moving the client
                takes the group with it. That was right but invisible — and the
                groups section it happened in is usually collapsed, or hidden
                outright once the new project has no groups of its own. */}
            {droppedGroup && <Txt as="p" className="m-hint">{t('editClient.projectDroppedGroup', { group: droppedGroup })}</Txt>}
          </Box>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.email')}</Box>
          <Input type="email" className="m-input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder={t('common.emailPlaceholder')} dir="ltr" aria-label={t('common.email')} />
        </Box>
      </Section>

      <Section
        icon={<CalendarDays size={17} strokeWidth={1.7} />}
        title={t('editClient.secScheduling')}
        summary={schedSummary}
        open={openSecs.has('scheduling')}
        onToggle={() => toggleSec('scheduling')}
      >
        <Box className="m-field">
          <Box className="m-label-row">
            <Box as="label" className="m-label">{t('editClient.meetingType')}</Box>
            <Btn type="button" className="m-clear-link" onClick={() => setManageTypes(true)}>{t('editClient.manageMeetingTypes')}</Btn>
          </Box>
          <select className="m-select" value={form.meeting_type_id || ''} onChange={(e) => pickMeetingType(e.target.value)}aria-label={t('editClient.meetingType')} >
            <option value="">{t('common.none')}</option>
            {meetingTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>
                {mt.name}{mt.default_price != null ? ` · ₪${mt.default_price}` : ''}
              </option>
            ))}
          </select>
        </Box>
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('editClient.fixedDay')}</Box>
            <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}aria-label={t('editClient.fixedDay')} >
              <option value="">{t('common.none')}</option>
              {DAYS.map((d) => <option key={d} value={d}>{t(`common.day${d}`)}</option>)}
            </select>
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('editClient.fixedTime')}</Box>
            <Input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} aria-label={t('editClient.fixedTime')} />
          </Box>
        </Box>
        {/* End time — the client's own slot length. It was in the form state and
            saved back, but had no control here, so a 1-on-1 slot could never be
            anything other than the calendar's 60-minute fallback (the day view
            reads duration_minutes, then the subject's recurring_end_time, then
            gives up). Groups have had all three fields for as long as clients
            have had none — same row shape as EditGroupModal. */}
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('editClient.fixedEndTime')}</Box>
            <Input type="time" className="m-input" value={form.recurring_end_time} onChange={(e) => set('recurring_end_time', e.target.value)} aria-label={t('editClient.fixedEndTime')} />
            <Txt as="p" className="m-hint">{t('editClient.fixedEndTimeHint')}</Txt>
          </Box>
        </Box>
        {/* Reachable clear — a native time input can't be emptied on touch, so
            this is the only path back to "no fixed meeting". Gated on the three
            fields this section SHOWS, end time included: it now has a control
            of its own right above, and it's precisely the kind of field a touch
            user cannot empty by hand. (While it had no control, this same test
            put a "clear the fixed meeting" link above an empty day and an empty
            time, offering to clear nothing the user could see — adding the
            field is what fixes that, not dropping the test.) */}
        {(form.recurring_day !== '' || form.recurring_time !== '' || form.recurring_end_time !== '') && (
          <Btn
            type="button"
            className="m-clear-link"
            onClick={() => { set('recurring_day', ''); set('recurring_time', ''); set('recurring_end_time', '') }}
          >
            {t('editClient.clearFixed')}
          </Btn>
        )}
      </Section>

      <Section
        icon={<Wallet size={17} strokeWidth={1.7} />}
        title={t('editClient.secBilling')}
        summary={billingSummary}
        open={openSecs.has('billing')}
        onToggle={() => toggleSec('billing')}
      >
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.billingMode')}</Box>
          <Box className="m-pills">
            <Btn type="button" className={`m-pill${!isPerSession ? ' on' : ''}`} onClick={() => set('billing_mode', 'package')}>{t('editClient.billingPackage')}</Btn>
            <Btn type="button" className={`m-pill${isPerSession ? ' on' : ''}`} onClick={() => set('billing_mode', 'per_session')}>{t('editClient.billingPerSession')}</Btn>
          </Box>
          {modeChanged && (
            <>
              <Txt as="p" className="m-sub">{t('editClient.billingModeChangeNote')}</Txt>
              <Txt as="p" className="m-hint">
                {balanceAfter === balanceBefore
                  ? t('editClient.billingModeChangeSame')
                  : t('editClient.billingModeChangePreview', { from: isr(balanceBefore), to: isr(balanceAfter) })}
              </Txt>
            </>
          )}
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.personalSessions')}</Box>
          {/* "נקבעו" shows in BOTH modes now. It was hidden for per-session
              because it is not what bills them — but hiding it also removed
              the only way to say how many meetings are booked ahead, so the
              card reported 0 forever and the only route to a real number was
              to switch to package billing. In per-session the field is purely
              informational: the bill is still done × price. */}
          <Box className="ec-bill ec-bill-2">
            <Box className="ec-bill-cell">
              <Txt as="p" className="ec-bill-label">{t('editClient.scheduled')}</Txt>
              <Input type="number" min="0" className="ec-bill-input" value={form.sessions}
                onChange={(e) => set('sessions', e.target.value)} aria-label={t('editClient.scheduled')} />
            </Box>
            <Box className="ec-bill-cell divided-start">
              <Txt as="p" className="ec-bill-label">{t('editClient.done')}</Txt>
              <Input type="number" min="0" className="ec-bill-input" value={form.done}
                onChange={(e) => set('done', e.target.value)} aria-label={t('editClient.done')} />
            </Box>
          </Box>
          {isPerSession && (
            <Txt as="p" className="m-hint">{t('editClient.scheduledPerSessionHint')}</Txt>
          )}
          {/* Say what the app is about to file. A hand-edited "בוצעו" does not
              rewrite history — it records the gap against what was actually
              logged, and that gap outlives the edit. */}
          {doneDelta !== 0 && (
            <Txt as="p" className="m-hint">
              {t('editClient.doneAdjustHint', { held: personalHeld, delta: doneDelta > 0 ? `+${doneDelta}` : String(doneDelta) })}
            </Txt>
          )}
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.pricePerSession')}</Box>
          <Input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => setPrice(e.target.value)} aria-label={t('editClient.pricePerSession')} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.totalDueOptional')}</Box>
          {/* The formula names the mode's ACTUAL inputs. It read "פגישות ×
              מחיר" in both modes, which is only true of a package — a
              per-session client is billed on the meetings that took place. */}
          <Input type="number" min="0" className="m-input" value={form.total_due}
            onChange={(e) => set('total_due', e.target.value)} placeholder={t('editClient.totalDuePlaceholder', { formula: totalDueFormula })} aria-label={t('editClient.totalDueOptional')}
          />
          <Txt as="p" className="m-hint">{t('editClient.totalDueHint', { formula: totalDueFormula })}</Txt>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.billingCardLabel')}</Box>
          <Box className="ec-bill ec-bill-2">
            <Box className="ec-bill-cell">
              <Txt as="p" className="ec-bill-label">{t('editClient.paid')}</Txt>
              <Box className="ec-bill-money">
                <Txt className="ec-bill-cur">₪</Txt>
                <Input type="number" className="ec-bill-input" value={form.paid}
                  onChange={(e) => set('paid', e.target.value)} aria-label={t('editClient.paid')} />
              </Box>
            </Box>
            <Box className="ec-bill-cell divided-start">
              <Txt as="p" className="ec-bill-label">{t('editClient.balance')}</Txt>
              <Box className="ec-bill-money">
                <Txt className="ec-bill-cur">₪</Txt>
                <Input type="number" className="ec-bill-input" value={balanceDraft ?? String(liveBalance)}
                  onChange={(e) => onBalanceInput(e.target.value)}
                  onBlur={() => setBalanceDraft(null)}
                  aria-label={t('editClient.balance')} />
              </Box>
            </Box>
          </Box>
          <Txt as="p" className="ec-bill-hint">{t('editClient.billingHint', { total: isr(liveTotal) })}</Txt>
          {(memberTotal > 0 || liveAdj !== 0) && (
            <Box className="ec-formula">
              {memberTotal > 0 && (
                <Txt as="p" className="ec-formula-row">
                  {t('editClient.fPersonal')} <Txt className="num">{isr(privatePortion)}</Txt>
                  {' · '}
                  {t('editClient.fGroups')} <Txt className="num">{isr(memberTotal)}</Txt>
                </Txt>
              )}
              {liveAdj !== 0 && (
                <Txt as="p" className="ec-formula-row">
                  {t('editClient.fDiscount')} <Txt className="num">{isr(liveAdj)}</Txt>
                </Txt>
              )}
            </Box>
          )}
        </Box>
      </Section>

      {showGroupsSection && (
        <Section
          icon={<Users size={17} strokeWidth={1.7} />}
          title={t('editClient.secGroups')}
          summary={groupsSummary}
          open={openSecs.has('groups')}
          onToggle={() => toggleSec('groups')}
        >
          {projectHasGroups && (
            <Box className="m-field">
              <Box as="label" className="m-label">{t('common.groupOptional')}</Box>
              <select className="m-select" value={form.group_id} onChange={(e) => { set('group_id', e.target.value); if (e.target.value) setDroppedGroup('') }}aria-label={t('common.groupOptional')} >
                <option value="">{t('editClient.noGroup')}</option>
                {groups.filter((g) => g.project_id === form.project_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Box>
          )}
          {groupSessions.length > 0 && (
            <Box className="m-field">
              {groupSessions.map((gs) => (
                <Box key={gs.id} className="ec-grp-row">
                  <Txt className="ec-grp-name">{t('editClient.groupSessions', { name: gs.name })}</Txt>
                  <Txt className="ec-grp-val">{t('editClient.groupSessionsVal', { held: gs.held, quota: gs.quota || 0 })}</Txt>
                </Box>
              ))}
            </Box>
          )}
          {memberships.length > 0 && (
            <Box className="m-field">
              <Box as="label" className="m-label">{t('editClient.perGroupBilling')}</Box>
              {memberships.map((m) => {
                const g = groups.find((x) => x.id === m.group_id)
                return (
                  <Box key={m.id} className="m-row2" style={{ alignItems: 'center', marginBottom: '6px' }}>
                    <Txt style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--espresso)' }}>{g?.name || t('editClient.groupFallback')}</Txt>
                    <Input
                      type="number"
                      min="0"
                      className="m-input"
                      value={memberOverrides[m.id] ?? ''}
                      onChange={(e) => setMemberOverrides((o) => ({ ...o, [m.id]: e.target.value }))}
                      placeholder={t('editClient.perGroupPlaceholder')}
                      aria-label={t('editClient.perGroupBilling')}
                    />
                  </Box>
                )
              })}
              <Txt as="p" className="m-hint">{t('editClient.perGroupHint')}</Txt>
            </Box>
          )}
        </Section>
      )}

      {/* Save failures only — the name error is rendered at its own field. */}
      {err && !!form.name.trim() && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>

      <ConfirmModal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={ts('discard.title')}
        message={ts('discard.message')}
        confirmLabel={ts('discard.confirm')}
        cancelLabel={ts('discard.cancel')}
        danger
        onConfirm={() => { setConfirmDiscard(false); onClose() }}
      />
    </Modal>
    <MeetingTypesModal open={manageTypes} onClose={() => { setManageTypes(false); refetchMeetingTypes() }} />
    </>
  )
}
