import { useState } from 'react'
import Modal from './Modal'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = () => ({
  title: '', description: '',
  date: todayStr(), time: '09:00',
  client_id: '',
  recurrence: 'none',
  every_x: '2',
  end_date: '',
})
const RECURRENCES = [
  { k: 'none', l: 'חד-פעמית' },
  { k: 'weekly', l: 'שבועי' },
  { k: 'monthly_date', l: 'חודשי' },
  { k: 'every_x_days', l: 'כל X ימים' },
]

/* onSave is async (Supabase insert). Supports one-off or recurring reminders:
   weekly (same weekday), monthly on the date, or every X days. */
export default function AddReminderModal({ open, onClose, onSave, clients = [] }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.title.trim()) { setErr('יש למלא כותרת.'); return }
    if (!form.date || !form.time) { setErr('יש לבחור תאריך ושעה.'); return }
    const x = parseInt(form.every_x, 10)
    if (form.recurrence === 'every_x_days' && (!x || x < 1)) { setErr('יש לבחור מספר ימים חיובי.'); return }
    setBusy(true)
    setErr('')
    const scheduled = new Date(`${form.date}T${form.time}`)
    let pattern = null
    if (form.recurrence === 'weekly') pattern = { dayOfWeek: scheduled.getDay() }
    else if (form.recurrence === 'monthly_date') pattern = { dayOfMonth: scheduled.getDate() }
    else if (form.recurrence === 'every_x_days') pattern = { x }
    try {
      await onSave({
        title: form.title.trim(),
        description: form.description.trim() || null,
        scheduled_at: scheduled.toISOString(),
        recurrence_type: form.recurrence,
        recurrence_pattern: pattern,
        end_date: form.recurrence !== 'none' && form.end_date ? form.end_date : null,
        linked_to_type: form.client_id ? 'client' : null,
        linked_to_id: form.client_id || null,
        status: 'pending',
        type: null,
        channel: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  const titleMissing = !!err && !form.title.trim()
  const recurring = form.recurrence !== 'none'

  return (
    <Modal open={open} onClose={close} title="תזכורת חדשה">
      <div className="m-field">
        <label className="m-label">על מה להזכיר?</label>
        <input
          className={`m-input${titleMissing ? ' err' : ''}`}
          value={form.title}
          onChange={(e) => { set('title', e.target.value); if (err) setErr('') }}
          placeholder="כותרת התזכורת"
        />
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">תאריך</label>
          <input type="date" className="m-input" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div className="m-field">
          <label className="m-label">שעה</label>
          <input type="time" className="m-input" value={form.time} onChange={(e) => set('time', e.target.value)} />
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">חזרתיות</label>
        <div className="m-pills">
          {RECURRENCES.map((r) => (
            <button key={r.k} type="button" className={`m-pill${form.recurrence === r.k ? ' on' : ''}`} onClick={() => set('recurrence', r.k)}>{r.l}</button>
          ))}
        </div>
      </div>
      {form.recurrence === 'every_x_days' && (
        <div className="m-field">
          <label className="m-label">כל כמה ימים</label>
          <input type="number" min="1" className="m-input" value={form.every_x} onChange={(e) => set('every_x', e.target.value)} />
        </div>
      )}
      {recurring && (
        <div className="m-field">
          <label className="m-label">תאריך סיום (אופציונלי)</label>
          <input type="date" className="m-input" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </div>
      )}
      <div className="m-field">
        <label className="m-label">לקוח מקושר (אופציונלי)</label>
        <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
          <option value="">ללא</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="m-field">
        <label className="m-label">פרטים (אופציונלי)</label>
        <textarea className="m-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="פרטים נוספים" />
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
