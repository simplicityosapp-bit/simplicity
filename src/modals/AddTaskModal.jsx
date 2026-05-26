import { useState } from 'react'
import Modal from './Modal'

const PRIORITIES = [
  { k: 'high', l: 'דחוף' },
  { k: 'medium', l: 'רגיל' },
  { k: 'low', l: 'נמוך' },
]
const blank = () => ({ title: '', priority: 'medium', project_id: '', client_id: '' })

/* onSave is async (Supabase insert). */
export default function AddTaskModal({ open, onClose, onSave, projects = [], clients = [] }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr('חובה למלא תיאור'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        title: form.title.trim(),
        priority: form.priority,
        status: 'todo',
        project_id: form.project_id || null,
        client_id: form.client_id || null,
        completed_at: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  const titleMissing = !!err && !form.title.trim()

  return (
    <Modal open={open} onClose={close} title="משימה חדשה">
      <div className="m-field">
        <label className="m-label">מה צריך לעשות?</label>
        <input
          className={`m-input${titleMissing ? ' err' : ''}`}
          value={form.title}
          onChange={(e) => { set('title', e.target.value); if (err) setErr('') }}
          placeholder="תיאור המשימה"
        />
      </div>
      <div className="m-field">
        <label className="m-label">קדימות</label>
        <div className="m-pills">
          {PRIORITIES.map((p) => (
            <button key={p.k} type="button" className={`m-pill${form.priority === p.k ? ' on' : ''}`} onClick={() => set('priority', p.k)}>{p.l}</button>
          ))}
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">פרויקט</label>
          <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">ללא</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="m-field">
          <label className="m-label">לקוח</label>
          <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
            <option value="">ללא</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
