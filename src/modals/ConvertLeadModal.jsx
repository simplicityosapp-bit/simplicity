import { useState } from 'react'
import Modal from './Modal'
import { showToast } from '../lib/toast'

/* Convert a lead → client. The lead's name/phone seed the form; the
   user can adjust and pick a project. On save:
     1. insert a new client (status='active', no sessions/price yet)
     2. update the lead — status_meta='converted', converted_at=now,
        converted_to_client_id=newClient.id, last_status_changed_at=now,
        with source='converted' so the lead_status_log captures it.
   The parent wires onCreateClient + onUpdateLead so the modal stays
   adapter-agnostic. */
export default function ConvertLeadModal({ open, onClose, lead, projects = [], statuses = [], onCreateClient, onUpdateLead }) {
  const [form, setForm] = useState(() => ({
    name: lead?.name || '',
    phone: lead?.phone || '',
    project_id: '',
    status_id: '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!lead) return <Modal open={open} onClose={onClose} title="המרת ליד ללקוח" />

  /* Sub-statuses inside the 'converted' meta — if the user has
     defined any, offer them so the lead_status_log captures the
     transition cleanly. */
  const convertedSubStatuses = statuses.filter((s) => s.meta_category === 'converted')
  const defaultConverted = convertedSubStatuses.find((s) => s.is_default)

  const submit = async () => {
    if (!form.name.trim()) { setErr('יש לתת שם ללקוח.'); return }
    setBusy(true)
    setErr('')
    const now = new Date().toISOString()
    try {
      /* Step 1 — create the client. */
      const newClient = await onCreateClient({
        name: form.name.trim(),
        status: 'active',
        status_meta: 'active',
        status_id: null,
        project_id: form.project_id || null,
        group_id: null,
        sessions: 0,
        price_per_session: 0,
        total_override: null,
        has_custom_price: false,
        recurring_day: null,
        recurring_time: null,
        left_mid_process: false,
        phone: form.phone.trim() || null,
        notes: lead.notes || null,
        notes_updated_at: lead.notes ? now : null,
      })

      /* Step 2 — flip the lead to 'converted' and stamp the link.
         Pass source='converted' so the log row labels the transition
         correctly. The sub-status (if any) drives whether a log row
         is actually written — the table requires to_status_id. */
      const subStatusId = form.status_id || defaultConverted?.id || null
      await onUpdateLead(
        lead.id,
        {
          status_meta: 'converted',
          status_id: subStatusId,
          converted_at: now,
          converted_to_client_id: newClient.id,
          last_status_changed_at: now,
        },
        { source: 'converted' },
      )
      showToast('נוצר לקוח חדש')
      onClose()
    } catch (e) {
      setBusy(false)
      setErr('ההמרה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="המרת ליד ללקוח">
      <p className="m-sub">
        <span className="m-sub-dot" style={{ background: 'var(--sage)' }} />
        {lead.name}
      </p>

      <div className="m-field">
        <label className="m-label">שם הלקוח</label>
        <input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
        />
      </div>

      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">טלפון</label>
          <input className="m-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="050-0000000" />
        </div>
        <div className="m-field">
          <label className="m-label">פרויקט (אופציונלי)</label>
          <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">ללא</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {convertedSubStatuses.length > 0 && (
        <div className="m-field">
          <label className="m-label">תת-סטטוס "הומר" (אופציונלי)</label>
          <select className="m-select" value={form.status_id} onChange={(e) => set('status_id', e.target.value)}>
            <option value="">{defaultConverted ? `ברירת מחדל (${defaultConverted.display_name})` : 'ללא'}</option>
            {convertedSubStatuses.map((s) => <option key={s.id} value={s.id}>{s.icon ? s.icon + ' ' : ''}{s.display_name}</option>)}
          </select>
        </div>
      )}

      <p className="m-hint">
        ייווצר לקוח חדש; הליד יסומן כ"הומר ללקוח" ויישאר בעמודה "הומרו" עם קישור ללקוח החדש.
      </p>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'ממיר…' : 'המר ללקוח'}</button>
      </div>
    </Modal>
  )
}
