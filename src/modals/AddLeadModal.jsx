import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = () => ({ name: '', phone: '', source_id: '', project_id: '', status_id: '', inquiry_date: todayStr(), follow_up_date: '', notes: '' })

/* onSave is async (Supabase insert). New leads land in the "בתהליך" column;
   the user can optionally pick a sub-status from those defined in Settings,
   and optionally tie the lead to a project. */
export default function AddLeadModal({ open, onClose, onSave, sources = [], statuses = [], projects = [] }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.name.trim()) { setErr('חובה למלא שם'); return }
    setBusy(true)
    setErr('')
    const now = new Date().toISOString()
    try {
      await onSave({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        source_id: form.source_id || null,
        project_id: form.project_id || null,
        status: 'new',
        status_id: form.status_id || null,
        status_meta: 'in_process',
        inquiry_date: form.inquiry_date,
        follow_up_date: form.follow_up_date || null,
        last_status_changed_at: now,
        notes: form.notes.trim() || null,
        converted_to_client_id: null,
        converted_at: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  const nameMissing = !!err && !form.name.trim()

  return (
    <Modal open={open} onClose={close} title="ליד חדש">
      <div className="m-field">
        <label className="m-label">שם</label>
        <input
          className={`m-input${nameMissing ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
          placeholder="שם הפונה"
        />
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">טלפון</label>
          <input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" />
        </div>
        <div className="m-field">
          <label className="m-label">מקור</label>
          <select className="m-select" value={form.source_id} onChange={(e) => set('source_id', e.target.value)}>
            <option value="">ללא</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">פרויקט (אופציונלי)</label>
        <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
          <option value="">ללא</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {statuses.filter((s) => s.meta_category === 'in_process').length > 0 && (
        <div className="m-field">
          <label className="m-label">תת-סטטוס (אופציונלי)</label>
          <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
            <option value="">ללא</option>
            {statuses.filter((s) => s.meta_category === 'in_process').map((s) => (
              <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">תאריך פנייה</label>
          <DateField value={form.inquiry_date} onChange={(e) => set('inquiry_date', e.target.value)} />
        </div>
        <div className="m-field">
          <label className="m-label">מעקב</label>
          <DateField value={form.follow_up_date} onChange={(e) => set('follow_up_date', e.target.value)} />
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">הערות</label>
        <textarea className="m-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="מה הליד מחפש/ת?" />
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
