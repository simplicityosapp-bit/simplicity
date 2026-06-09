import { useState } from 'react'
import Modal from './Modal'
import DateField from '../components/DateField'
import { useAddress } from '../hooks/useAddress'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = () => ({ client_id: '', joined_at: todayStr() })

/* Add a client to a group. `availableClients` should exclude clients who are
   already members. joined_at defaults to today. */
export default function AddGroupMemberModal({ open, onClose, onSave, group, availableClients = [] }) {
  const { addr, tryAgain } = useAddress()
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    if (!form.client_id) { setErr('יש לבחור לקוח.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        group_id: group.id,
        client_id: form.client_id,
        /* Join date is optional — default to today when left blank. */
        joined_at: new Date(form.joined_at ? `${form.joined_at}T12:00:00` : Date.now()).toISOString(),
        left_at: null,
        total_override: null,
        has_custom_price: false,
        package_sessions_override: null,
        left_mid_process: false,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  return (
    <Modal open={open} onClose={close} title="הוספת לקוח לקבוצה">
      {group && (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: group.color || 'var(--stone)' }} />
          {group.name}
        </p>
      )}
      <div className="m-field">
        <label className="m-label">לקוח</label>
        {availableClients.length ? (
          <select className="m-select" value={form.client_id} onChange={(e) => { set('client_id', e.target.value); if (err) setErr('') }}>
            <option value="">{addr({ male: 'בחר לקוח', female: 'בחרי לקוח', neutral: 'בחר/י לקוח' })}</option>
            {availableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <p className="m-error">כל הלקוחות שלך כבר חברים בקבוצה.</p>
        )}
      </div>
      <div className="m-field">
        <label className="m-label">תאריך הצטרפות (אופציונלי)</label>
        <DateField value={form.joined_at} onChange={(e) => set('joined_at', e.target.value)} />
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy || !availableClients.length}>{busy ? 'שומר…' : 'הוספה'}</button>
      </div>
    </Modal>
  )
}
