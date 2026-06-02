import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = () => ({ date: todayStr(), summary: '', notes: '' })

/* Log a past session. The caller composes the full row (client_id or group_id,
   subject_type, num). This modal collects when + summary + notes. Subject is
   either a client (drawer flow) or a group (group flow). */
export default function AddSessionModal({ open, onClose, onSave, client, group, nextNum }) {
  const subject = group || client
  const subjectColor = group ? (group.color || 'var(--stone)') : 'var(--sage)'
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.date) { setErr('יש לבחור תאריך.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        date: new Date(`${form.date}T12:00:00`).toISOString(),
        summary: form.summary.trim() || null,
        notes: form.notes.trim() || null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  return (
    <Modal open={open} onClose={close} title="תיעוד פגישה">
      {subject && (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: subjectColor }} />
          {subject.name}{nextNum ? ` · פגישה #${nextNum}` : ''}
        </p>
      )}
      <div className="m-field">
        <label className="m-label">תאריך הפגישה</label>
        <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
      </div>
      <div className="m-field">
        <label className="m-label">סיכום (אופציונלי)</label>
        <textarea className="m-textarea" value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="מה עלה בפגישה? מה הצעד הבא?" />
      </div>
      <div className="m-field">
        <label className="m-label">הערות פרטיות (אופציונלי)</label>
        <input className="m-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="הערה לעצמך" />
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
