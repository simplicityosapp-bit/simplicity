import { useState } from 'react'
import Modal from './Modal'
import DateField from '../components/DateField'
import { useAddress } from '../hooks/useAddress'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function blank(defaults = {}) {
  return {
    type: defaults.type || 'expense',
    amount: '',
    desc: '',
    trigger_type: defaults.trigger_type || 'schedule',
    cadence_type: defaults.cadence_type || 'monthly_date',
    day_of_month: defaults.day_of_month ?? new Date().getDate(),
    day_of_week: defaults.day_of_week ?? new Date().getDay(),
    until_date: '',
    client_id: '',
    project_id: '',
    category_id: '',
    active: true,
  }
}

function fromTemplate(t) {
  return {
    type: t.type,
    amount: String(t.amount),
    desc: t.desc || '',
    trigger_type: t.trigger_type || 'schedule',
    cadence_type: t.cadence_type || 'monthly_date',
    day_of_month: t.day_of_month ?? 1,
    day_of_week: t.day_of_week ?? 0,
    until_date: t.until_date || '',
    client_id: t.client_id || '',
    project_id: t.project_id || '',
    category_id: t.category_id || '',
    active: t.active !== false,
  }
}

/* Add OR edit. `template` switches mode — null/undefined is "add",
   an object is "edit". onSave receives the patch; the caller picks
   insert vs update. */
export default function RecurringModal({ open, onClose, onSave, template, clients = [], projects = [], categories = [] }) {
  const { addr, tryAgain } = useAddress()
  const isEdit = !!template
  const [form, setForm] = useState(() => (template ? fromTemplate(template) : blank()))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => {
    setForm(template ? fromTemplate(template) : blank())
    setErr('')
    setBusy(false)
    onClose()
  }

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr('יש למלא סכום חיובי.'); return }
    if (form.trigger_type === 'on_meeting') {
      if (!form.client_id) { setErr('יש לבחור לקוח שאליו מקושרת הפגישה.'); return }
    } else if (form.cadence_type === 'monthly_date') {
      const day = parseInt(form.day_of_month, 10)
      if (!day || day < 1 || day > 31) { setErr('יום בחודש לא תקין.'); return }
    } else if (form.cadence_type === 'weekly') {
      const dow = parseInt(form.day_of_week, 10)
      if (Number.isNaN(dow) || dow < 0 || dow > 6) { setErr('יום בשבוע לא תקין.'); return }
    }
    setBusy(true)
    setErr('')
    try {
      const onMeeting = form.trigger_type === 'on_meeting'
      await onSave({
        type: form.type,
        amount,
        desc: form.desc.trim() || null,
        trigger_type: form.trigger_type,
        /* When linked to a meeting, the cadence fields are irrelevant.
           We still write the existing defaults so a flip back to
           'schedule' doesn't lose information, but the engine ignores
           them while trigger_type is 'on_meeting'. */
        cadence_type: form.cadence_type,
        day_of_month: form.cadence_type === 'monthly_date' ? parseInt(form.day_of_month, 10) : null,
        day_of_week: form.cadence_type === 'weekly' ? parseInt(form.day_of_week, 10) : null,
        until_date: onMeeting ? null : (form.until_date || null),
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        category_id: form.type === 'expense' ? (form.category_id || null) : null,
        active: form.active,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    }
  }

  const amountInvalid = !!err && !(parseFloat(form.amount) > 0)

  return (
    <Modal open={open} onClose={close} title={isEdit ? 'עריכת תבנית' : 'תבנית חוזרת חדשה'}>
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
          <label className="m-label">תיאור</label>
          <input
            className="m-input"
            value={form.desc}
            onChange={(e) => set('desc', e.target.value)}
            placeholder="לדוגמה: שכ״ד"
          />
        </div>
      </div>

      <div className="m-field">
        <label className="m-label">מתי לחזור</label>
        <div className="m-pills">
          <button type="button" className={`m-pill${form.trigger_type === 'schedule' ? ' on' : ''}`} onClick={() => set('trigger_type', 'schedule')}>לפי לוח זמנים</button>
          <button type="button" className={`m-pill${form.trigger_type === 'on_meeting' ? ' on' : ''}`} onClick={() => set('trigger_type', 'on_meeting')}>בעקבות פגישה</button>
        </div>
        {form.trigger_type === 'on_meeting' && (
          <p className="m-hint">תיווצר תנועה ממתינה לכל פגישה עם הלקוח {addr({ male: 'שתבחר', female: 'שתבחרי', neutral: 'שתבחר/י' })} למטה. נסגרת אוטומטית כשמסמנים את הפגישה כדולגה.</p>
        )}
      </div>

      {form.trigger_type === 'schedule' && (
        <>
          <div className="m-field">
            <label className="m-label">חוזרת</label>
            <div className="m-pills">
              <button type="button" className={`m-pill${form.cadence_type === 'monthly_date' ? ' on' : ''}`} onClick={() => set('cadence_type', 'monthly_date')}>חודשית</button>
              <button type="button" className={`m-pill${form.cadence_type === 'weekly' ? ' on' : ''}`} onClick={() => set('cadence_type', 'weekly')}>שבועית</button>
            </div>
          </div>

          <div className="m-row2">
            {form.cadence_type === 'monthly_date' ? (
              <div className="m-field">
                <label className="m-label">יום בחודש</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="m-input"
                  value={form.day_of_month}
                  onChange={(e) => set('day_of_month', e.target.value)}
                />
              </div>
            ) : (
              <div className="m-field">
                <label className="m-label">יום בשבוע</label>
                <select
                  className="m-select"
                  value={form.day_of_week}
                  onChange={(e) => set('day_of_week', parseInt(e.target.value, 10))}
                >
                  {DAY_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
                </select>
              </div>
            )}
            <div className="m-field">
              <label className="m-label">תוקף עד (אופציונלי)</label>
              <DateField
                value={form.until_date}
                onChange={(e) => set('until_date', e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{form.trigger_type === 'on_meeting' ? 'לקוח (חובה)' : 'לקוח (אופציונלי)'}</label>
          <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
            <option value="">ללא</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="m-field">
          <label className="m-label">פרויקט (אופציונלי)</label>
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

      {isEdit && (
        <div className="m-field">
          <label className="m-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" className="m-check" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            פעילה (מייצרת תנועות באופן אוטומטי)
          </label>
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
