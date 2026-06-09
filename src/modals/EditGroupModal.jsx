import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import DateField from '../components/DateField'
import { GROUP_BILLING_MODES, GROUP_BILLING_LABELS } from '../lib/enums'
import { useAddress } from '../hooks/useAddress'

const COLORS = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']
const DAYS = [
  { k: 0, l: 'ראשון' }, { k: 1, l: 'שני' }, { k: 2, l: 'שלישי' },
  { k: 3, l: 'רביעי' }, { k: 4, l: 'חמישי' }, { k: 5, l: 'שישי' }, { k: 6, l: 'שבת' },
]

export default function EditGroupModal({ open, onClose, onSave, onDelete, group }) {
  const { tryAgain } = useAddress()
  const [form, setForm] = useState(() => ({
    name: group?.name || '',
    color: group?.color || COLORS[0],
    billing_mode: group?.billing_mode || 'package',
    package_price: group?.package_price ?? '',
    package_sessions: group?.package_sessions ?? '',
    price_per_session: group?.price_per_session ?? '',
    recurring_day: group?.recurring_day == null ? '' : String(group.recurring_day),
    recurring_time: group?.recurring_time || '',
    recurring_end_time: group?.recurring_end_time || '',
    recurring_start_date: group?.recurring_start_date || '',
    recurring_end_date: group?.recurring_end_date || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!group) return <Modal open={open} onClose={onClose} title="עריכת קבוצה" />

  const submit = async () => {
    if (!form.name.trim()) { setErr('יש למלא שם.'); return }
    const mode = form.billing_mode
    const price = parseFloat(form.package_price)
    const sess = parseInt(form.package_sessions, 10)
    const perSession = parseFloat(form.price_per_session)
    if (mode === 'package') {
      if (!(price > 0)) { setErr('יש למלא מחיר חבילה חיובי.'); return }
      if (!(sess > 0)) { setErr('יש למלא מספר פגישות חיובי.'); return }
    } else if (mode === 'per_session') {
      if (!(perSession > 0)) { setErr('יש למלא מחיר לפגישה חיובי.'); return }
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(group.id, {
        name: form.name.trim(),
        color: form.color,
        billing_mode: mode,
        package_price: mode === 'package' ? price : null,
        package_sessions: mode === 'package' ? sess : null,
        price_per_session: mode === 'per_session' ? perSession : null,
        recurring_day: form.recurring_day === '' ? null : Number(form.recurring_day),
        recurring_time: form.recurring_time || null,
        recurring_end_time: form.recurring_end_time || null,
        recurring_start_date: form.recurring_start_date || null,
        recurring_end_date: form.recurring_end_date || null,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="עריכת קבוצה">
      <div className="m-field">
        <label className="m-label">שם הקבוצה</label>
        <input
          className={`m-input${err && !form.name.trim() ? ' err' : ''}`}
          value={form.name}
          onChange={(e) => { set('name', e.target.value); if (err) setErr('') }}
        />
      </div>
      <div className="m-field">
        <label className="m-label">תמחור</label>
        <div className="m-seg">
          {GROUP_BILLING_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={`m-seg-btn${form.billing_mode === mode ? ' on' : ''}`}
              onClick={() => { set('billing_mode', mode); if (err) setErr('') }}
            >
              {GROUP_BILLING_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {form.billing_mode === 'package' && (
        <div className="m-row2">
          <div className="m-field">
            <label className="m-label">מחיר חבילה ₪</label>
            <input type="number" min="0" className="m-input" value={form.package_price} onChange={(e) => set('package_price', e.target.value)} />
          </div>
          <div className="m-field">
            <label className="m-label">מספר פגישות</label>
            <input type="number" min="1" className="m-input" value={form.package_sessions} onChange={(e) => set('package_sessions', e.target.value)} />
          </div>
        </div>
      )}

      {form.billing_mode === 'per_session' && (
        <div className="m-field">
          <label className="m-label">מחיר לפגישה ₪</label>
          <input type="number" min="0" className="m-input" value={form.price_per_session} onChange={(e) => set('price_per_session', e.target.value)} />
        </div>
      )}

      {form.billing_mode === 'none' && (
        <p className="m-hint">בלי מחיר קבוע מראש. אפשר לתמחר כל חבר בנפרד דרך כרטיס הלקוח.</p>
      )}
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">יום קבוע</label>
          <select className="m-select" value={form.recurring_day} onChange={(e) => set('recurring_day', e.target.value)}>
            <option value="">ללא</option>
            {DAYS.map((d) => <option key={d.k} value={d.k}>{d.l}</option>)}
          </select>
        </div>
        <div className="m-field">
          <label className="m-label">שעת התחלה</label>
          <input type="time" className="m-input" value={form.recurring_time} onChange={(e) => set('recurring_time', e.target.value)} />
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">שעת סיום</label>
          <input type="time" className="m-input" value={form.recurring_end_time} onChange={(e) => set('recurring_end_time', e.target.value)} />
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">תאריך התחלה (אופציונלי)</label>
          <DateField value={form.recurring_start_date} onChange={(e) => set('recurring_start_date', e.target.value)} />
        </div>
        <div className="m-field">
          <label className="m-label">תאריך סיום (אופציונלי)</label>
          <DateField value={form.recurring_end_date} onChange={(e) => set('recurring_end_date', e.target.value)} />
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">צבע</label>
        <div className="m-colors">
          {COLORS.map((c) => (
            <button key={c} type="button" className={`m-color${form.color === c ? ' on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => set('color', c)} />
          ))}
        </div>
      </div>

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
      {onDelete && (
        <button type="button" className="m-btn-delete" onClick={() => onDelete(group)}>
          <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" /> מחיקת הקבוצה
        </button>
      )}
    </Modal>
  )
}
