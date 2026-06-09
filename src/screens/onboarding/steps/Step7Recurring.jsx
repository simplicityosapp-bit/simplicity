import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useRecurring } from '../../../hooks/useRecurring'
import { addressUser } from '../../../lib/address'
import { isr } from '../../../lib/finance'

/* Quick-fill presets. "אחר" clears the composer so the user types their own. */
const PRESETS = [
  { k: 'rent',      label: 'שכירות',     type: 'expense', amount: 3500 },
  { k: 'insurance', label: 'ביטוח',      type: 'expense', amount: 220 },
  { k: 'phone',     label: 'מנוי חודשי', type: 'expense', amount: 70  },
  { k: 'office',    label: 'ייעוץ',      type: 'expense', amount: 950 },
  { k: 'other',     label: 'אחר',        clear: true },
]

/* Step 7 — recurring items. Optional, and now multi-add: each "הוסף לרשימה"
   commits a real recurring_templates row and clears the composer so the user
   can stack several (mirrors the step-4 client flow). monthly_date cadence;
   on_meeting / every-X-days can be set later from the finance screen. */
export default function Step7Recurring({ ob, setCTA }) {
  const addr = (v) => addressUser(ob.state.answers?.profile?.gender, v)
  const { addRecurring, removeRecurring } = useRecurring()
  const initial = ob.state.answers?.recurring || {}
  const [type, setType] = useState('expense')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [added, setAdded] = useState(initial.added || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const tryAgain = addr({ male: 'נסה שוב', female: 'נסי שוב', neutral: 'נסה/י שוב' })
  const composerValid = desc.trim().length > 0 && Number(amount) > 0
  const canAdvance = added.length > 0 || composerValid
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint: null }) }, [type, desc, amount, dayOfMonth, added, busy, canAdvance]) // eslint-disable-line react-hooks/exhaustive-deps

  const fillPreset = (p) => {
    if (p.clear) { setType('expense'); setDesc(''); setAmount(''); return }
    setType(p.type); setDesc(p.label); setAmount(p.amount)
  }
  const resetComposer = () => { setType('expense'); setDesc(''); setAmount(''); setDayOfMonth(1) }

  const buildRow = () => ({
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

  /* Commit the composer to a real row, stash it in the list + answers,
     and clear the fields so the next one can be entered. */
  const commitComposer = async () => {
    const row = await addRecurring(buildRow())
    const next = [...added, { id: row.id, desc: desc.trim(), amount: Number(amount), type }]
    setAdded(next)
    await ob.setAnswers('recurring', { added: next, created_ids: next.map((a) => a.id) })
    return next
  }

  const onAddToList = async () => {
    if (!composerValid) return
    setBusy(true); setErr('')
    try { await commitComposer(); resetComposer() }
    catch (e) { setErr('השמירה נכשלה: ' + (e.message || tryAgain)) }
    finally { setBusy(false) }
  }

  const onRemove = async (id) => {
    try { await removeRecurring(id) } catch { /* non-fatal — keep the UI in sync regardless */ }
    const next = added.filter((a) => a.id !== id)
    setAdded(next)
    await ob.setAnswers('recurring', { added: next, created_ids: next.map((a) => a.id) })
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      if (composerValid) await commitComposer()
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || tryAgain))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="ob-intro">אם יש לך תנועות חוזרות — זה המקום</p>
      <p className="ob-intro-sub">הוצאות והכנסות חוזרות מחושבות אל תוך התזרים שלך בכל חודש — {addr({ male: 'ותוכל', female: 'ותוכלי', neutral: 'ותוכל/י' })} תמיד לבטל, להוסיף או לערוך אותן בקלות.</p>

      <div className="ob-field">
        <p className="ob-label">הצעות מהירות</p>
        <div className="ob-pills">
          {PRESETS.map((p) => (
            <button
              key={p.k}
              type="button"
              className={`ob-pill${!p.clear && desc === p.label ? ' on' : ''}`}
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

      {composerValid && (
        <button type="button" className="ob-pc-add" onClick={onAddToList} disabled={busy}>
          + {addr({ male: 'הוסף', female: 'הוסיפי', neutral: 'הוסף/י' })} לרשימה
        </button>
      )}

      {added.length > 0 && (
        <div className="ob-field">
          <p className="ob-label">נוספו ({added.length})</p>
          <div className="ob-pc-group-list">
            {added.map((a) => (
              <div key={a.id} className="ob-pc-group">
                <span className="ob-pc-group-color" style={{ background: a.type === 'income' ? 'var(--sage)' : 'var(--clay)' }} />
                <div className="ob-pc-group-body">
                  <p className="ob-pc-group-name">{a.desc}</p>
                  <p className="ob-pc-group-meta">{a.type === 'income' ? 'הכנסה' : 'הוצאה'} · {isr(a.amount)}</p>
                </div>
                <button type="button" className="ob-pc-group-x" onClick={() => onRemove(a.id)} aria-label={`הסר ${a.desc}`}>
                  <X size={13} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

    </>
  )
}
