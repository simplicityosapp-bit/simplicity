import { useState } from 'react'
import { useRecurring } from '../../../hooks/useRecurring'

const PRESETS = [
  { k: 'rent',      label: 'שכירות',       type: 'expense', amount: 3500 },
  { k: 'insurance', label: 'ביטוח',        type: 'expense', amount: 220 },
  { k: 'phone',     label: 'מנוי טלפון',   type: 'expense', amount: 70  },
  { k: 'office',    label: 'חבר משרד',     type: 'expense', amount: 950 },
  { k: 'retainer',  label: 'ריטיינר חודשי',type: 'income',  amount: 4500 },
]

/* Step 7 — first recurring item. Optional. We use the same
   recurring_templates table the finance screen reads. monthly_date
   is the simplest cadence to introduce here; on_meeting + every-X-days
   can be configured later from the finance screen. */
export default function Step7Recurring({ ob }) {
  const { addRecurring } = useRecurring()
  const initial = ob.state.answers?.recurring || {}
  const [type, setType] = useState(initial.type || 'expense')
  const [desc, setDesc] = useState(initial.desc || '')
  const [amount, setAmount] = useState(initial.amount || '')
  const [dayOfMonth, setDayOfMonth] = useState(initial.day_of_month || 1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canAdvance = desc.trim().length > 0 && Number(amount) > 0

  const fillPreset = (p) => {
    setType(p.type)
    setDesc(p.label)
    setAmount(p.amount)
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const row = await addRecurring({
        type,
        amount: Number(amount),
        desc: desc.trim(),
        client_id: null,
        project_id: null,
        category_id: null,
        cadence_type: 'monthly_date',
        day_of_month: Number(dayOfMonth) || 1,
        day_of_week: null,
        trigger_type: 'schedule',
        until_date: null,
        active: true,
      })
      await ob.setAnswers('recurring', {
        type,
        desc: desc.trim(),
        amount: Number(amount),
        day_of_month: Number(dayOfMonth) || 1,
        created_ids: [...(initial.created_ids || []), row.id],
      })
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="ob-intro">יש הוצאות או הכנסות שחוזרות כל חודש?</p>
      <p className="ob-intro-sub">נרשם פעם אחת, ייווצרו אוטומטית כל חודש כתנועה ממתינה — את/ה רק מאשר/ת.</p>

      <div className="ob-field">
        <p className="ob-label">הצעות מהירות</p>
        <div className="ob-pills">
          {PRESETS.map((p) => (
            <button
              key={p.k}
              type="button"
              className={`ob-pill${desc === p.label ? ' on' : ''}`}
              onClick={() => fillPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ob-step-grid">
        <div className="ob-field">
          <label className="ob-label">סוג</label>
          <div className="ob-pills">
            <button type="button" className={`ob-pill${type === 'expense' ? ' on' : ''}`} onClick={() => setType('expense')}>הוצאה</button>
            <button type="button" className={`ob-pill${type === 'income' ? ' on' : ''}`} onClick={() => setType('income')}>הכנסה</button>
          </div>
        </div>
        <div className="ob-field">
          <label className="ob-label" htmlFor="ob-r-day">יום בחודש</label>
          <input
            id="ob-r-day"
            className="ob-input"
            type="number"
            min="1"
            max="28"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-r-desc">תיאור</label>
        <input
          id="ob-r-desc"
          className="ob-input"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="לדוגמה: שכירות"
        />
      </div>
      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-r-amt">סכום ₪</label>
        <input
          id="ob-r-amt"
          className="ob-input"
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="ob-btn primary"
          onClick={onNext}
          disabled={!canAdvance || busy}
        >
          {busy ? 'שומר…' : 'הלאה'}
        </button>
      </div>
    </>
  )
}
