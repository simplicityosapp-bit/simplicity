import { useState } from 'react'
import Modal from './Modal'
import ClientFormFields from '../components/ClientFormFields'

const blank = () => ({
  name: '', status: 'active', status_id: '', sessions: '', price_per_session: '',
  billing_mode: 'package',
  phone: '', project_id: '', group_id: '',
  recurring_day: '', recurring_time: '',
})

/* onSave is async (Supabase insert). Sub-status is optional — the user can
   define sub-statuses per meta-category in Settings. Form body is the shared
   <ClientFormFields> so it stays identical to the onboarding client step. */
export default function AddClientModal({ open, onClose, onSave, projects = [], statuses = [] }) {
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (err) setErr('') }
  const setMeta = (k) => { setForm((f) => ({ ...f, status: k, status_id: '' })); if (err) setErr('') }
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

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
        group_id: form.group_id || null,
        sessions: form.billing_mode === 'per_session' ? 0 : (Number(form.sessions) || 0),
        price_per_session: Number(form.price_per_session) || 0,
        billing_mode: form.billing_mode || 'package',
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

  return (
    <Modal open={open} onClose={close} title="לקוח חדש">
      <ClientFormFields
        form={form}
        set={set}
        setMeta={setMeta}
        projects={projects}
        statuses={statuses}
        err={err}
      />

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
