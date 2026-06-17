import { useState } from 'react'
import Modal from './Modal'
import { isr } from '../lib/finance'
import { useT } from '../i18n/useT'

const STATUSES = [
  { k: 'active', l: 'statusActive' },
  { k: 'wandering', l: 'statusWandering' },
  { k: 'past', l: 'statusPast' },
  { k: 'no_status', l: 'statusNone' },
]
const DAYS = [0, 1, 2, 3, 4, 5, 6]

/* Edit a client — name / status / sub-status / sessions / price / phone /
   project. Parent passes key={client?.id} so this remounts cleanly per client. */
export default function EditClientModal({ open, onClose, onSave, client, projects = [], groups = [], statuses = [], memberships = [], onUpdateMember, onPaidEntry, rawPaid = 0, memberTotal = 0, personalHeld = 0, groupSessions = [] }) {
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
    project_id: client?.project_id || '',
    group_id: client?.group_id || '',
    notes: client?.notes || '',
    recurring_day: client?.recurring_day != null ? String(client.recurring_day) : '',
    recurring_time: client?.recurring_time || '',
    recurring_end_time: client?.recurring_end_time || '',
    recurring_start_date: client?.recurring_start_date || '',
    recurring_end_date: client?.recurring_end_date || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* Which billing cell the user last touched — decides save behaviour:
     'paid' → prompt for a real transaction; 'balance' → silent adjustment. */
  const [lastBillEdit, setLastBillEdit] = useState(null)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMeta = (k) => setForm((f) => ({ ...f, status: k, status_id: '' }))

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

  const submit = async () => {
    if (!form.name.trim()) { setErr(t('common.nameRequired')); return }
    setBusy(true)
    setErr('')
    try {
      const patch = {
        name: form.name.trim(),
        status: form.status,
        status_meta: form.status,
        status_id: form.status_id || null,
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
        notes: form.notes.trim() || null,
        recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
        /* A fixed meeting needs a day; with no day the times are inert — drop
           them so a stray time can never persist a half-set meeting. */
        recurring_time: form.recurring_day !== '' ? (form.recurring_time || null) : null,
        recurring_end_time: form.recurring_day !== '' ? (form.recurring_end_time || null) : null,
        recurring_start_date: form.recurring_start_date || null,
        recurring_end_date: form.recurring_end_date || null,
      }
      /* "נעשה" manual edit → store the delta as sessions_done_adjustment;
         only when it actually changes, so it never depends on migration
         0011 existing. ("נקבע" is just form.sessions, saved above.) */
      const nextDoneAdj = (Number(form.done) || 0) - personalHeld
      const prevDoneAdj = Number(client?.sessions_done_adjustment) || 0
      if (nextDoneAdj !== prevDoneAdj) patch.sessions_done_adjustment = nextDoneAdj
      /* Billing intent split:
         - edited "יתרה" → silent balance_adjustment (forgive/zero; needs 0010)
         - edited "שולם" → a real payment → prompt the parent to record a
           transaction (handled after save); never written as adjustment.
         balance_adjustment is included ONLY when it actually changes, so a
         normal edit never depends on migration 0010 existing. */
      const prevAdj = Number(client?.balance_adjustment) || 0
      const nextPaid = Number(form.paid) || 0
      let paymentDelta = 0
      if (lastBillEdit === 'balance') {
        const nextAdj = Number(form.adjustment) || 0
        if (nextAdj !== prevAdj) patch.balance_adjustment = nextAdj
      } else if (lastBillEdit === 'paid') {
        /* delta vs the currently-shown "שולם" (= real income + informal adj). */
        paymentDelta = nextPaid - (rawPaid + (Number(client?.paid_adjustment) || 0))
      }
      await onSave(client.id, patch)
      /* Persist any changed per-group billing overrides. */
      for (const m of memberships) {
        const raw = memberOverrides[m.id]
        const next = raw !== '' && raw != null ? Math.max(0, Number(raw) || 0) : null
        if (next !== (m.total_override ?? null)) {
          await onUpdateMember?.(m.id, { total_override: next, has_custom_price: next != null })
        }
      }
      /* A manual "שולם" change → hand the delta to the parent so it can ask
         whether to record a real transaction. */
      if (paymentDelta !== 0) onPaidEntry?.(paymentDelta)
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('editClient.title')}>
      <div className="m-field">
        <label className="m-label">{t('common.name')}</label>
        <input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
        />
      </div>
      <div className="m-field">
        <label className="m-label">{t('editClient.status')}</label>
        <div className="m-pills">
          {STATUSES.map((s) => (
            <button key={s.k} type="button" className={`m-pill${form.status === s.k ? ' on' : ''}`} onClick={() => setMeta(s.k)}>{t(`editClient.${s.l}`)}</button>
          ))}
        </div>
      </div>
      {subStatuses.length > 0 && (
        <div className="m-field">
          <label className="m-label">{t('common.subStatusOptional')}</label>
          <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {subStatuses.map((s) => <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>)}
          </select>
        </div>
      )}
      <div className="m-field">
        <label className="m-label">{t('editClient.billingMode')}</label>
        <div className="m-pills">
          <button type="button" className={`m-pill${!isPerSession ? ' on' : ''}`} onClick={() => set('billing_mode', 'package')}>{t('editClient.billingPackage')}</button>
          <button type="button" className={`m-pill${isPerSession ? ' on' : ''}`} onClick={() => set('billing_mode', 'per_session')}>{t('editClient.billingPerSession')}</button>
        </div>
        {form.billing_mode !== (client?.billing_mode || 'package') && (
          <p className="m-sub">{t('editClient.billingModeChangeNote')}</p>
        )}
      </div>
      <div className="m-field">
        <label className="m-label">{t('editClient.personalSessions')}</label>
        <div className={`ec-bill${isPerSession ? '' : ' ec-bill-2'}`} style={isPerSession ? { gridTemplateColumns: '1fr' } : undefined}>
          {!isPerSession && (
            <div className="ec-bill-cell">
              <p className="ec-bill-label">{t('editClient.scheduled')}</p>
              <input type="number" min="0" className="ec-bill-input" value={form.sessions}
                onChange={(e) => set('sessions', e.target.value)} aria-label={t('editClient.scheduled')} />
            </div>
          )}
          <div className={`ec-bill-cell${isPerSession ? '' : ' divided-start'}`}>
            <p className="ec-bill-label">{t('editClient.done')}</p>
            <input type="number" min="0" className="ec-bill-input" value={form.done}
              onChange={(e) => set('done', e.target.value)} aria-label={t('editClient.done')} />
          </div>
        </div>
        {groupSessions.map((gs) => (
          <div key={gs.id} className="ec-grp-row">
            <span className="ec-grp-name">{t('editClient.groupSessions', { name: gs.name })}</span>
            <span className="ec-grp-val">{t('editClient.groupSessionsVal', { held: gs.held, quota: gs.quota || 0 })}</span>
          </div>
        ))}
      </div>
      <div className="m-field">
        <label className="m-label">{t('editClient.pricePerSession')}</label>
        <input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => set('price_per_session', e.target.value)} />
      </div>
      <div className="m-field">
        <label className="m-label">{t('editClient.totalDueOptional')}</label>
        <input type="number" min="0" className="m-input" value={form.total_due}
          onChange={(e) => set('total_due', e.target.value)} placeholder={t('editClient.totalDuePlaceholder')} />
        <p className="m-hint">{t('editClient.totalDueHint')}</p>
      </div>
      <div className="m-field">
        <label className="m-label">{t('editClient.billingCardLabel')}</label>
        <div className="ec-bill ec-bill-2">
          <div className="ec-bill-cell">
            <p className="ec-bill-label">{t('editClient.paid')}</p>
            <div className="ec-bill-money">
              <span className="ec-bill-cur">₪</span>
              <input type="number" className="ec-bill-input" value={form.paid}
                onChange={(e) => { set('paid', e.target.value); setLastBillEdit('paid') }} aria-label={t('editClient.paid')} />
            </div>
          </div>
          <div className="ec-bill-cell divided-start">
            <p className="ec-bill-label">{t('editClient.balance')}</p>
            <div className="ec-bill-money">
              <span className="ec-bill-cur">₪</span>
              <input type="number" className="ec-bill-input" value={String(liveBalance)}
                onChange={(e) => { setBalance(e.target.value); setLastBillEdit('balance') }} aria-label={t('editClient.balance')} />
            </div>
          </div>
        </div>
        <p className="ec-bill-hint">{t('editClient.billingHint', { total: isr(liveTotal) })}</p>
      </div>
      {memberships.length > 0 && (
        <div className="m-field">
          <label className="m-label">{t('editClient.perGroupBilling')}</label>
          {memberships.map((m) => {
            const g = groups.find((x) => x.id === m.group_id)
            return (
              <div key={m.id} className="m-row2" style={{ alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: 'calc(13px * var(--text-scale))', color: 'var(--espresso)' }}>{g?.name || t('editClient.groupFallback')}</span>
                <input
                  type="number"
                  min="0"
                  className="m-input"
                  value={memberOverrides[m.id] ?? ''}
                  onChange={(e) => setMemberOverrides((o) => ({ ...o, [m.id]: e.target.value }))}
                  placeholder={t('editClient.perGroupPlaceholder')}
                />
              </div>
            )
          })}
          <p className="m-hint">{t('editClient.perGroupHint')}</p>
        </div>
      )}
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('common.phone')}</label>
          <input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t('common.phonePlaceholder')} />
        </div>
        <div className="m-field">
          <label className="m-label">{t('common.project')}</label>
          <select className="m-select" value={form.project_id} onChange={(e) => { set('project_id', e.target.value); set('group_id', '') }}>
            <option value="">{t('common.none')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">{t('common.email')}</label>
        <input type="email" className="m-input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder={t('common.emailPlaceholder')} dir="ltr" />
      </div>
      {form.project_id && groups.some((g) => g.project_id === form.project_id) && (
        <div className="m-field">
          <label className="m-label">{t('common.groupOptional')}</label>
          <select className="m-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
            <option value="">{t('editClient.noGroup')}</option>
            {groups.filter((g) => g.project_id === form.project_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('editClient.fixedDay')}</label>
          <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {DAYS.map((d) => <option key={d} value={d}>{t(`common.day${d}`)}</option>)}
          </select>
        </div>
        <div className="m-field">
          <label className="m-label">{t('editClient.fixedTime')}</label>
          <input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} />
        </div>
      </div>
      {/* Reachable clear — a native time input can't be emptied on touch, so
          this is the only path back to "no fixed meeting". */}
      {(form.recurring_day !== '' || form.recurring_time !== '' || form.recurring_end_time !== '') && (
        <button
          type="button"
          className="m-clear-link"
          onClick={() => { set('recurring_day', ''); set('recurring_time', ''); set('recurring_end_time', '') }}
        >
          {t('editClient.clearFixed')}
        </button>
      )}

      <div className="m-field">
        <label className="m-label">{t('common.notesOptional')}</label>
        <textarea className="m-textarea" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </Modal>
  )
}
