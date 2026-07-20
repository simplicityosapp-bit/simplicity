import { useState } from 'react'
import { User, CalendarDays, Wallet, Users, ChevronDown, MapPin } from 'lucide-react'
import Modal from './Modal'
import MeetingTypesModal from './MeetingTypesModal'
import { isr } from '@simplicity/core'
import { useMeetingTypes } from '../hooks/useMeetingTypes'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input, Textarea } from '../components/ui'
import DateField from '../components/DateField'

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

/* Edit a client — name / status / sub-status / sessions / price / phone /
   project. Parent passes key={client?.id} so this remounts cleanly per client.
   The fields are grouped into four foldable sections (details / scheduling /
   billing / groups) so the form reads top-down instead of as one long scroll.
   None of the billing math or save logic changes with the regroup. */
export default function EditClientModal({ open, onClose, onSave, client, projects = [], groups = [], statuses = [], memberships = [], onUpdateMember, onPaidEntry, onBalanceEntry, rawPaid = 0, memberTotal = 0, personalHeld = 0, groupSessions = [] }) {
  const { t } = useT('modalsClient')
  /* Per-group billing override (group_members.total_override) — keyed by
     membership id. Lets the user manually set a member's total after the
     group's billing mode produced a default. */
  const [memberOverrides, setMemberOverrides] = useState(() =>
    Object.fromEntries((memberships || []).map((m) => [m.id, m.total_override != null ? String(m.total_override) : ''])),
  )
  const [form, setForm] = useState(() => ({
    name: client?.name || '',
    status: client?.status || 'active',
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
    address: client?.address || '',
    birth_date: client?.birth_date || '',
    project_id: client?.project_id || '',
    group_id: client?.group_id || '',
    notes: client?.notes || '',
    recurring_day: client?.recurring_day != null ? String(client.recurring_day) : '',
    recurring_time: client?.recurring_time || '',
    recurring_end_time: client?.recurring_end_time || '',
    recurring_start_date: client?.recurring_start_date || '',
    recurring_end_date: client?.recurring_end_date || '',
    meeting_type_id: client?.meeting_type_id || '',
    price_overridden: client?.price_overridden ?? false,
  }))
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

  if (!client) return <Modal open={open} onClose={onClose} title={t('editClient.title')} />
  const subStatuses = statuses.filter((s) => s.meta_category === form.status)

  /* Live billing snapshot — mirrors the card. Billing is per-client: the
     group dues (memberTotal, 0 for non-members) PLUS the private portion
     (total_override when set — incl. an explicit 0 for "free" — else by
     billing_mode: package = sessions × price, per_session = held × price;
     migration 0014). The editable "שולם"/"יתרה" are two views of it. */
  const isPerSession = form.billing_mode === 'per_session'
  const privatePortion = form.total_due !== ''
    ? Math.max(0, Number(form.total_due) || 0)
    : isPerSession
      ? (Number(form.done) || 0) * (Number(form.price_per_session) || 0)
      : (Number(form.sessions) || 0) * (Number(form.price_per_session) || 0)
  const liveTotal = (Number(memberTotal) || 0) + privatePortion
  const livePaid = Number(form.paid) || 0
  const liveAdj = Number(form.adjustment) || 0
  const liveBalance = liveTotal - livePaid - liveAdj
  /* Editing "יתרה" moves the forgiveness (adjustment) — "שולם" stays put. */
  const setBalance = (v) => set('adjustment', String(liveTotal - livePaid - (Number(v) || 0)))

  /* Collapsed-header summaries (live values). */
  const statusLabel = t(`editClient.${(STATUSES.find((s) => s.k === form.status) || STATUSES[0]).l}`)
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
        address: form.address?.trim() || null,
        birth_date: form.birth_date || null,
        project_id: form.project_id || null,
        group_id: form.group_id || null,
        notes: form.notes.trim() || null,
        recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
        /* A fixed meeting needs a day; with no day the times are inert — drop
           them so a stray time can never persist a half-set meeting. */
        recurring_time: form.recurring_day !== '' ? (form.recurring_time || null) : null,
        recurring_end_time: form.recurring_day !== '' ? (form.recurring_end_time || null) : null,
        recurring_start_date: form.recurring_start_date || null,
        recurring_end_date: form.recurring_end_date || null,
        meeting_type_id: form.meeting_type_id || null,
        price_overridden: !!form.price_overridden,
      }
      /* "נעשה" manual edit → store the delta as sessions_done_adjustment;
         only when it actually changes, so it never depends on migration
         0011 existing. ("נקבע" is just form.sessions, saved above.) */
      const nextDoneAdj = (Number(form.done) || 0) - personalHeld
      const prevDoneAdj = Number(client?.sessions_done_adjustment) || 0
      if (nextDoneAdj !== prevDoneAdj) patch.sessions_done_adjustment = nextDoneAdj
      /* The client file shows "עודכן {date}" under the notes, but the stamp was
         only ever written on CREATE — so an edited note kept a stale date, or
         showed none at all. Stamp it only when the text actually changed, so a
         plain save never bumps it. */
      if ((form.notes.trim() || null) !== (client.notes ?? null)) {
        patch.notes_updated_at = new Date().toISOString()
      }
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
         sheet so it lands in the ledger with a reason. Paid wins if somehow
         both changed in one save — the sheet takes one adjustment at a time,
         and «שולם» is the one that claims money actually moved. */
      if (paymentDelta !== 0) onPaidEntry?.(paymentDelta)
      else if (balanceDelta !== 0) onBalanceEntry?.(balanceDelta)
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
    <Modal open={open} onClose={onClose} title={t('editClient.title')}>
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
          />
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
            <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
              <option value="">{t('common.none')}</option>
              {subStatuses.map((s) => <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>)}
            </select>
          </Box>
        )}
        <Box className="m-row2">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('common.phone')}</Box>
            <Input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t('common.phonePlaceholder')} />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('common.project')}</Box>
            <select className="m-select" value={form.project_id} onChange={(e) => { set('project_id', e.target.value); set('group_id', '') }}>
              <option value="">{t('common.none')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Box>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.email')}</Box>
          <Input type="email" className="m-input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder={t('common.emailPlaceholder')} dir="ltr" />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.notesOptional')}</Box>
          <Textarea className="m-textarea" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Box>
      </Section>

      <Section
        icon={<MapPin size={17} strokeWidth={1.7} />}
        title={t('editClient.secMoreDetails')}
        summary={form.address || ''}
        open={openSecs.has('more')}
        onToggle={() => toggleSec('more')}
      >
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.address')}</Box>
          <Input className="m-input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('common.addressPlaceholder')} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.birthDate')}</Box>
          <DateField className="m-input" value={form.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} />
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
          <select className="m-select" value={form.meeting_type_id || ''} onChange={(e) => pickMeetingType(e.target.value)}>
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
            <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}>
              <option value="">{t('common.none')}</option>
              {DAYS.map((d) => <option key={d} value={d}>{t(`common.day${d}`)}</option>)}
            </select>
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('editClient.fixedTime')}</Box>
            <Input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} />
          </Box>
        </Box>
        {/* Reachable clear — a native time input can't be emptied on touch, so
            this is the only path back to "no fixed meeting". */}
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
          {form.billing_mode !== (client?.billing_mode || 'package') && (
            <Txt as="p" className="m-sub">{t('editClient.billingModeChangeNote')}</Txt>
          )}
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.personalSessions')}</Box>
          <Box className={`ec-bill${isPerSession ? '' : ' ec-bill-2'}`} style={isPerSession ? { gridTemplateColumns: '1fr' } : undefined}>
            {!isPerSession && (
              <Box className="ec-bill-cell">
                <Txt as="p" className="ec-bill-label">{t('editClient.scheduled')}</Txt>
                <Input type="number" min="0" className="ec-bill-input" value={form.sessions}
                  onChange={(e) => set('sessions', e.target.value)} aria-label={t('editClient.scheduled')} />
              </Box>
            )}
            <Box className={`ec-bill-cell${isPerSession ? '' : ' divided-start'}`}>
              <Txt as="p" className="ec-bill-label">{t('editClient.done')}</Txt>
              <Input type="number" min="0" className="ec-bill-input" value={form.done}
                onChange={(e) => set('done', e.target.value)} aria-label={t('editClient.done')} />
            </Box>
          </Box>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.pricePerSession')}</Box>
          <Input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => setPrice(e.target.value)} />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('editClient.totalDueOptional')}</Box>
          <Input type="number" min="0" className="m-input" value={form.total_due}
            onChange={(e) => set('total_due', e.target.value)} placeholder={t('editClient.totalDuePlaceholder')} />
          <Txt as="p" className="m-hint">{t('editClient.totalDueHint')}</Txt>
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
                <Input type="number" className="ec-bill-input" value={String(liveBalance)}
                  onChange={(e) => setBalance(e.target.value)} aria-label={t('editClient.balance')} />
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
              <select className="m-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
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
                    />
                  </Box>
                )
              })}
              <Txt as="p" className="m-hint">{t('editClient.perGroupHint')}</Txt>
            </Box>
          )}
        </Section>
      )}

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>

    </Modal>
    <MeetingTypesModal open={manageTypes} onClose={() => { setManageTypes(false); refetchMeetingTypes() }} />
    </>
  )
}
