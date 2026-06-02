import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'

const todayStr = () => new Date().toISOString().slice(0, 10)
const blank = (defaults = {}) => ({
  type: defaults.type || 'income',
  amount: '',
  desc: '',
  date: todayStr(),
  client_id: defaults.client_id || '',
  project_id: defaults.project_id || '',
  category_id: '',
})

/* onSave is async (Supabase insert). When `client` is provided the client is
   locked (drawer "קיבלתי תשלום" flow); otherwise a select is shown.
   `defaults` lets callers pre-fill any blank() field — used by the
   project-detail QuickRow to pre-bind project_id so the user doesn't
   have to re-pick the project they're clearly already on. */
export default function AddTransactionModal({ open, onClose, onSave, clients = [], projects = [], categories = [], client, defaultType, defaults = {} }) {
  const lockedClientId = client?.id || ''
  const initial = { ...defaults, client_id: lockedClientId || defaults.client_id, type: defaultType || defaults.type }
  const [form, setForm] = useState(() => blank(initial))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank(initial)); setErr(''); setBusy(false); onClose() }

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr('יש למלא סכום חיובי.'); return }
    setBusy(true)
    setErr('')
    const isFuture = form.date > todayStr()
    try {
      await onSave({
        amount,
        type: form.type,
        desc: form.desc.trim() || (form.type === 'income' ? 'הכנסה' : 'הוצאה'),
        date: form.date,
        status: isFuture ? 'pending' : 'confirmed',
        project_id: form.project_id || null,
        client_id: lockedClientId || form.client_id || null,
        category_id: form.type === 'expense' ? (form.category_id || null) : null,
        recurring_id: null,
        orphaned_from: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  const amountInvalid = !!err && !(parseFloat(form.amount) > 0)

  return (
    <Modal open={open} onClose={close} title={client ? 'תשלום שהתקבל' : 'תנועה חדשה'}>
      {client && (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: 'var(--sage)' }} />
          {client.name}
        </p>
      )}
      <div className="m-field">
        <div className="m-pills">
          <button type="button" className={`m-pill${form.type === 'income' ? ' on income' : ''}`} onClick={() => set('type', 'income')}>+ הכנסה</button>
          <button type="button" className={`m-pill${form.type === 'expense' ? ' on expense' : ''}`} onClick={() => set('type', 'expense')}>− הוצאה</button>
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">סכום ₪</label>
          <input
            type="number"
            min="0"
            className={`m-input${amountInvalid ? ' err' : ''}`}
            value={form.amount}
            onChange={(e) => { set('amount', e.target.value); if (err) setErr('') }}
            placeholder="0"
          />
        </div>
        <div className="m-field">
          <label className="m-label">תאריך</label>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">תיאור</label>
        <input className="m-input" value={form.desc} onChange={(e) => set('desc', e.target.value)} placeholder="על מה התנועה?" />
      </div>
      {client ? (
        <div className="m-field">
          <label className="m-label">פרויקט</label>
          <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">ללא</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="m-row2">
          <div className="m-field">
            <label className="m-label">לקוח</label>
            <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
              <option value="">ללא</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="m-field">
            <label className="m-label">פרויקט</label>
            <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">ללא</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {form.type === 'expense' && (
        <div className="m-field">
          <label className="m-label">קטגוריה</label>
          <select className="m-select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">ללא קטגוריה</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
