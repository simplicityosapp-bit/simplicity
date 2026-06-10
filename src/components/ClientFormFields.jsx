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

const STATUSES = [
  { k: 'active', l: 'פעיל׌' },
  { k: 'wandering', l: 'ביניים' },
  { k: 'past', l: 'לשעבר' },
  { k: 'no_status', l: 'ללא' },
]
const DAYS = [
  { k: 0, l: 'ראשון' }, { k: 1, l: 'שני' }, { k: 2, l: 'שלישי' },
  { k: 3, l: 'רביעי' }, { k: 4, l: 'חמישי' }, { k: 5, l: 'שישי' }, { k: 6, l: 'שבת' },
]

export default function ClientFormFields({ form, set, setMeta, projects = [], statuses = [], groups = [], err }) {
  const subStatuses = statuses.filter((s) => s.meta_category === form.status)
  const nameMissing = !!err && !form.name.trim()

  return (
    <>
      <div className="m-field">
        <label className="m-label">שם</label>
        <input
          className={`m-input${nameMissing ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="שם הלקוח׌"
        />
      </div>

      <div className="m-field">
        <label className="m-label">סטטוס</label>
        <div className="m-pills">
          {STATUSES.map((s) => (
            <button
              key={s.k}
              type="button"
              className={`m-pill${form.status === s.k ? ' on' : ''}`}
              onClick={() => setMeta(s.k)}
            >
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {subStatuses.length > 0 && (
        <div className="m-field">
          <label className="m-label">תת-סטטוס (אופציונלי)</label>
          <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
            <option value="">ללא</option>
            {subStatuses.map((s) => <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>)}
          </select>
        </div>
      )}

      {/* Billing mode (migration 0014) — 'package' keeps the sessions ×
          price model; 'per_session' bills per held meeting, so the quota
          field is hidden. Switching back recalculates from the quota —
          soft warning below per per-session-billing.spec.md §5.2. */}
      <div className="m-field">
        <label className="m-label">אופן חיוב</label>
        <div className="m-pills">
          <button
            type="button"
            className={`m-pill${(form.billing_mode || 'package') === 'package' ? ' on' : ''}`}
            onClick={() => set('billing_mode', 'package')}
          >
            חבילה
          </button>
          <button
            type="button"
            className={`m-pill${form.billing_mode === 'per_session' ? ' on' : ''}`}
            onClick={() => set('billing_mode', 'per_session')}
          >
            לפי פגישה
          </button>
        </div>
        {form.billing_mode === 'per_session' && (
          <p className="m-sub">היתרה נצברת לפי פגישות שתועדו × מחיר לפגישה.</p>
        )}
      </div>

      <div className="m-row2">
        {form.billing_mode !== 'per_session' && (
          <div className="m-field">
            <label className="m-label">מספר פגישות</label>
            <input type="number" min="0" className="m-input" value={form.sessions} onChange={(e) => set('sessions', e.target.value)} placeholder="0" />
          </div>
        )}
        <div className="m-field">
          <label className="m-label">מחיר לפגישה ₪</label>
          <input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => set('price_per_session', e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">טלפון</label>
          <input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" />
        </div>
        <div className="m-field">
          <label className="m-label">פרויקט</label>
          <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">ללא</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="m-field">
          <label className="m-label">קבוצה (אופציונלי)</label>
          <select className="m-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
            <option value="">ללא קבוצה</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">פגישה קבועה — יום</label>
          <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}>
            <option value="">ללא</option>
            {DAYS.map((d) => <option key={d.k} value={d.k}>{d.l}</option>)}
          </select>
        </div>
        <div className="m-field">
          <label className="m-label">פגישה קבועה — שעה</label>
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
          ניקוי פגישה קבועה
        </button>
      )}
    </>
  )
}
