import { useState } from 'react'
import Modal from './Modal'

const STATUSES = [
  { k: 'active', l: 'פעיל' },
  { k: 'wandering', l: 'ביניים' },
  { k: 'past', l: 'לשעבר' },
  { k: 'no_status', l: 'ללא' },
]
const DAYS = [
  { k: 0, l: 'ראשון' }, { k: 1, l: 'שני' }, { k: 2, l: 'שלישי' },
  { k: 3, l: 'רביעי' }, { k: 4, l: 'חמישי' }, { k: 5, l: 'שישי' }, { k: 6, l: 'שבת' },
]
const blank = () => ({
  name: '', status: 'active', status_id: '', sessions: '', price_per_session: '',
  phone: '', project_id: '',
  recurring_day: '', recurring_time: '',
})

/* onSave is async (Supabase insert). Sub-status is optional — the user can
   define sub-statuses per meta-category in Settings. */
export default function AddClientModal({ open, onClose, onSave, projects = [], statuses = [] }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setMeta = (k) => setForm((f) => ({ ...f, status: k, status_id: '' }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }
  const subStatuses = statuses.filter((s) => s.meta_category === form.status)

  const submit = async () => {
    if (!form.name.trim()) { setErr('יש למלא שם.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        name: form.name.trim(),
        status: form.status,
        status_meta: form.status,
        status_id: form.status_id || null,
        project_id: form.project_id || null,
        group_id: null,
        sessions: Number(form.sessions) || 0,
        price_per_session: Number(form.price_per_session) || 0,
        total_override: null,
        has_custom_price: false,
        recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
        recurring_time: form.recurring_time || null,
        left_mid_process: false,
        phone: form.phone.trim() || null,
        notes: null,
        notes_updated_at: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  const nameMissing = !!err && !form.name.trim()

  return (
    <Modal open={open} onClose={close} title="לקוח חדש">
      <div className="m-field">
        <label className="m-label">שם</label>
        <input
          className={`m-input${nameMissing ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder="שם הלקוח/ה"
        />
      </div>
      <div className="m-field">
        <label className="m-label">סטטוס</label>
        <div className="m-pills">
          {STATUSES.map((s) => (
            <button key={s.k} type="button" className={`m-pill${form.status === s.k ? ' on' : ''}`} onClick={() => setMeta(s.k)}>{s.l}</button>
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
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">מספר פגישות</label>
          <input type="number" min="0" className="m-input" value={form.sessions} onChange={(e) => set('sessions', e.target.value)} placeholder="0" />
        </div>
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

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
