/* ════════════════════════════════════════════════════════════════
   ClientFormFields — the shared add/edit-client form body.
   ════════════════════════════════════════════════════════════════
   Extracted so the in-app AddClientModal AND the onboarding client
   step render the EXACT same fields — they can never drift apart.
   Uses the modal form classes (.m-field / .m-input / .m-pills …) so
   it looks identical wherever it's mounted.

   Props:
     - form:     the form state object (name, status, status_id,
                 sessions, price_per_session, phone, project_id,
                 group_id, recurring_day, recurring_time).
     - set:      (key, value) => void — generic field setter.
     - setMeta:  (statusKey) => void — sets status + clears sub-status.
     - projects: project options for the project select.
     - statuses: client_statuses; sub-status select shows only when the
                 active meta-category has sub-statuses.
     - groups:   OPTIONAL. When provided (non-empty), a group select is
                 shown. The in-app modal omits it, so its layout is
                 unchanged; onboarding passes the project's groups.
     - err:      current error string (drives the name's error ring).
   ════════════════════════════════════════════════════════════════ */

import { useT } from '../i18n/useT'

const STATUSES = [
  { k: 'active', labelKey: 'status.active' },
  { k: 'wandering', labelKey: 'status.wandering' },
  { k: 'past', labelKey: 'status.past' },
  { k: 'no_status', labelKey: 'form.none' },
]
const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6]

export default function ClientFormFields({ form, set, setMeta, projects = [], statuses = [], groups = [], err, meetingTypes = null, onPickMeetingType, onPriceChange, onManageMeetingTypes }) {
  const { t } = useT('clients')
  const subStatuses = statuses.filter((s) => s.meta_category === form.status)
  /* Meeting-type select is opt-in: only the in-app add/edit modals pass
     `meetingTypes`, so the onboarding step's layout stays unchanged. */
  const showMeetingTypes = Array.isArray(meetingTypes)
  const setPrice = onPriceChange || ((v) => set('price_per_session', v))
  const nameMissing = !!err && !form.name.trim()

  return (
    <>
      <div className="m-field">
        <label className="m-label">{t('form.name')}</label>
        <input
          className={`m-input${nameMissing ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={t('form.namePlaceholder')}
        />
      </div>

      <div className="m-field">
        <label className="m-label">{t('form.status')}</label>
        <div className="m-pills">
          {STATUSES.map((s) => (
            <button
              key={s.k}
              type="button"
              className={`m-pill${form.status === s.k ? ' on' : ''}`}
              onClick={() => setMeta(s.k)}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {subStatuses.length > 0 && (
        <div className="m-field">
          <label className="m-label">{t('form.subStatus')}</label>
          <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
            <option value="">{t('form.none')}</option>
            {subStatuses.map((s) => <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>)}
          </select>
        </div>
      )}

      {/* Billing mode (migration 0014) — 'package' keeps the sessions ×
          price model; 'per_session' bills per held meeting, so the quota
          field is hidden. Switching back recalculates from the quota —
          soft warning below per per-session-billing.spec.md §5.2. */}
      <div className="m-field">
        <label className="m-label">{t('form.billingMode')}</label>
        <div className="m-pills">
          <button
            type="button"
            className={`m-pill${(form.billing_mode || 'package') === 'package' ? ' on' : ''}`}
            onClick={() => set('billing_mode', 'package')}
          >
            {t('form.package')}
          </button>
          <button
            type="button"
            className={`m-pill${form.billing_mode === 'per_session' ? ' on' : ''}`}
            onClick={() => set('billing_mode', 'per_session')}
          >
            {t('form.perSession')}
          </button>
        </div>
        {form.billing_mode === 'per_session' && (
          <p className="m-sub">{t('form.perSessionNote')}</p>
        )}
      </div>

      <div className="m-row2">
        {form.billing_mode !== 'per_session' && (
          <div className="m-field">
            <label className="m-label">{t('form.sessionsCount')}</label>
            <input type="number" min="0" className="m-input" value={form.sessions} onChange={(e) => set('sessions', e.target.value)} placeholder="0" />
          </div>
        )}
        <div className="m-field">
          <label className="m-label">{t('form.pricePerSession')}</label>
          <input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </div>
      </div>

      {showMeetingTypes && (
        <div className="m-field">
          <div className="m-label-row">
            <label className="m-label">{t('form.meetingType')}</label>
            {onManageMeetingTypes && (
              <button type="button" className="m-clear-link" onClick={onManageMeetingTypes}>{t('form.manageMeetingTypes')}</button>
            )}
          </div>
          <select
            className="m-select"
            value={form.meeting_type_id || ''}
            onChange={(e) => (onPickMeetingType ? onPickMeetingType(e.target.value) : set('meeting_type_id', e.target.value))}
          >
            <option value="">{t('form.none')}</option>
            {meetingTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>
                {mt.name}{mt.default_price != null ? ` · ₪${mt.default_price}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('form.phone')}</label>
          <input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" />
        </div>
        <div className="m-field">
          <label className="m-label">{t('form.project')}</label>
          <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">{t('form.none')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="m-field">
        <label className="m-label">{t('form.email')}</label>
        <input type="email" className="m-input" value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" dir="ltr" />
      </div>

      <div className="m-field">
        <label className="m-label">{t('form.address')}</label>
        <input className="m-input" value={form.address || ''} onChange={(e) => set('address', e.target.value)} placeholder={t('form.addressPlaceholder')} />
      </div>

      {groups.length > 0 && (
        <div className="m-field">
          <label className="m-label">{t('form.group')}</label>
          <select className="m-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
            <option value="">{t('form.noGroup')}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('form.recurringDay')}</label>
          <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}>
            <option value="">{t('form.none')}</option>
            {DAY_KEYS.map((d) => <option key={d} value={d}>{t(`form.days.${d}`)}</option>)}
          </select>
        </div>
        <div className="m-field">
          <label className="m-label">{t('form.recurringTime')}</label>
          <input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} />
        </div>
      </div>
      {/* A native time input can't be emptied on touch devices, so once a
          fixed meeting is set by mistake there's no path back to "none".
          This reachable clear resets the whole pair (day + time). */}
      {(form.recurring_day !== '' || form.recurring_time !== '') && (
        <button
          type="button"
          className="m-clear-link"
          onClick={() => { set('recurring_day', ''); set('recurring_time', '') }}
        >
          {t('form.clearRecurring')}
        </button>
      )}
    </>
  )
}
