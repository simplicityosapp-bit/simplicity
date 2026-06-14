import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import InvoiceActions from '../components/InvoiceActions'
import { useAddress } from '../hooks/useAddress'

const STATUSES = [
  { k: 'confirmed', l: 'אושרה' },
  { k: 'pending', l: 'ממתינה' },
  { k: 'skipped', l: 'דולגה' },
]

/* Edit a transaction — type / amount / date / desc / status / client / project / category. */
export default function EditTransactionModal({ open, onClose, onSave, onIssued, tx, clients = [], projects = [], categories = [] }) {
  const { tryAgain } = useAddress()
  const [form, setForm] = useState(() => ({
    type: tx?.type || 'income',
    amount: tx?.amount ?? '',
    desc: tx?.desc || '',
    date: tx?.date ? new Date(tx.date).toISOString().slice(0, 10) : '',
    status: tx?.status || 'confirmed',
    client_id: tx?.client_id || '',
    project_id: tx?.project_id || '',
    category_id: tx?.category_id || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!tx) return <Modal open={open} onClose={onClose} title="עריכת תנועה" />

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr('יש למלא סכום חיובי.'); return }
    if (!form.date) { setErr('יש לבחור תאריך.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(tx.id, {
        type: form.type,
        amount,
        desc: form.desc.trim() || (form.type === 'income' ? 'הכנסה' : 'הוצאה'),
        date: form.date,
        status: form.status,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        category_id: form.type === 'expense' ? (form.category_id || null) : null,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="עריכת תנועה">
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
            className={`m-input${err && !(parseFloat(form.amount) > 0) ? ' err' : ''}`}
            value={form.amount}
            onChange={(e) => { set('amount', e.target.value); if (err) setErr('') }}
          />
        </div>
        <div className="m-field">
          <label className="m-label">תאריך</label>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">תיאור</label>
        <input className="m-input" value={form.desc} onChange={(e) => set('desc', e.target.value)} />
      </div>
      <div className="m-field">
        <label className="m-label">סטטוס</label>
        <div className="m-pills">
          {STATUSES.map((s) => (
            <button key={s.k} type="button" className={`m-pill${form.status === s.k ? ' on' : ''}`} onClick={() => set('status', s.k)}>{s.l}</button>
          ))}
        </div>
      </div>
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

      {form.type === 'expense' && (
        <div className="m-field">
          <label className="m-label">קטגוריה</label>
          <select className="m-select" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">ללא קטגוריה</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Issue a real invoice for this income payment (Route A). Renders only
          when an invoice provider is connected; based on the SAVED transaction. */}
      {tx.type === 'income' && (
        <InvoiceActions tx={tx} clientName={clients.find((c) => c.id === tx.client_id)?.name} onIssued={onIssued} />
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
