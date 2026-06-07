import { useState } from 'react'
import Modal from './Modal'

const PRIORITIES = [
  { k: 'high', l: 'דחוף' },
  { k: 'medium', l: 'רגיל' },
  { k: 'low', l: 'נמוך' },
]
const blank = () => ({ title: '', priority: 'medium', project_id: '', client_id: '', status_id: '', category_id: '' })
const fromTask = (t) => (t
  ? { title: t.title || '', priority: t.priority || 'medium', project_id: t.project_id || '', client_id: t.client_id || '', status_id: t.status_id || '', category_id: t.category_id || '' }
  : blank())

/* onSave is async (Supabase insert/update). Pass `task` to edit an existing one. */
export default function AddTaskModal({ open, onClose, onSave, projects = [], clients = [], statuses = [], categories = [], task = null }) {
  const isEdit = !!task
  const [form, setForm] = useState(() => fromTask(task))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(fromTask(task)); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr('חובה למלא תיאור'); return }
    setBusy(true)
    setErr('')
    try {
      /* A chosen custom status drives the binary status via its meta
         ('done' meta → done, else todo) so existing counters stay correct;
         the API's reconcileCompletion then syncs completed_at. With no
         custom status we keep the create default / leave an edit's status. */
      const chosen = statuses.find((s) => s.id === form.status_id)
      const metaStatus = chosen ? (chosen.meta_category === 'done' ? 'done' : 'todo') : null
      await onSave({
        title: form.title.trim(),
        priority: form.priority,
        project_id: form.project_id || null,
        client_id: form.client_id || null,
        status_id: form.status_id || null,
        category_id: form.category_id || null,
        ...(metaStatus ? { status: metaStatus } : (isEdit ? {} : { status: 'todo', completed_at: null })),
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  const titleMissing = !!err && !form.title.trim()

  return (
    <Modal open={open} onClose={close} title={isEdit ? 'עריכת משימה' : 'משימה חדשה'}>
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

      {(statuses.length > 0 || categories.length > 0) && (
        <div className="m-row2">
          {statuses.length > 0 && (
            <div className="m-field">
              <label className="m-label">סטטוס</label>
              <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
                <option value="">ללא</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </div>
          )}
          {categories.length > 0 && (
            <div className="m-field">
              <label className="m-label">קטגוריה</label>
              <select className="m-select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                <option value="">ללא</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
