import { useState } from 'react'
import Modal from './Modal'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = (clientId = '') => ({ client_id: clientId, date: todayStr(), time: '09:00' })

/* Schedule a future client meeting. If `client` is given the client is locked
   (drawer flow); otherwise a client picker is shown (calendar flow). */
export default function ScheduleMeetingModal({ open, onClose, onSave, client, clients = [] }) {
  const [form, setForm] = useState(() => blank(client?.id || ''))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank(client?.id || '')); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    const clientId = client?.id || form.client_id
    if (!clientId) { setErr('יש לבחור לקוח.'); return }
    if (!form.date || !form.time) { setErr('יש לבחור תאריך ושעה.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        subject_type: 'client',
        subject_id: clientId,
        scheduled_at: new Date(`${form.date}T${form.time}`).toISOString(),
        status: 'pending',
        session_id: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  return (
    <Modal open={open} onClose={close} title="תיאום פגישה">
      {client ? (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: 'var(--terracotta)' }} />
          {client.name}
        </p>
      ) : (
        <div className="m-field">
          <label className="m-label">לקוח</label>
          <select className="m-select" value={form.client_id} onChange={(e) => { set('client_id', e.target.value); if (err) setErr('') }}>
            <option value="">בחר/י לקוח</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
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

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
