import { useState } from 'react'
import Modal from './Modal'
import { questionText } from '../lib/questionTemplates'

const TIME_FRAMES = [
  { k: 'monthly', l: 'חודשי' },
  { k: 'weekly', l: 'שבועי' },
  { k: 'deadline', l: 'עד תאריך' },
]
const IMPORTANCE = [1, 2, 3, 4, 5]

/* Edit a goal — label / time_frame / target / importance / project / tracking
   (manual vs daily question for manual categories). */
export default function EditGoalModal({ open, onClose, onSave, goal, categories = [], projects = [], questions = [] }) {
  const [form, setForm] = useState(() => ({
    label: goal?.label || '',
    time_frame: goal?.time_frame || 'monthly',
    target_value: goal?.target_value ?? '',
    target_date: goal?.target_date || '',
    importance: goal?.importance ?? 3,
    project_id: goal?.project_id || '',
    tracking_method: goal?.tracking_method || 'manual',
    tracked_by_question_id: goal?.tracked_by_question_id || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!goal) return <Modal open={open} onClose={onClose} title="עריכת יעד" />

  const cat = categories.find((c) => c.id === goal.category_id)
  const isManual = cat?.measurement_type === 'manual'
  const byQuestion = isManual && form.tracking_method === 'daily_question'
  const activeQuestions = questions.filter((q) => q.active)

  const submit = async () => {
    const target = parseFloat(form.target_value)
    if (!target || target <= 0) { setErr('יש למלא יעד מספרי חיובי.'); return }
    if (form.time_frame === 'deadline' && !form.target_date) { setErr('יש לבחור תאריך יעד.'); return }
    if (byQuestion && !form.tracked_by_question_id) { setErr('יש לבחור שאלה יומית.'); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(goal.id, {
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        project_id: form.project_id || null,
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: byQuestion ? form.tracked_by_question_id : null,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="עריכת יעד">
      <div className="m-field">
        <label className="m-label">שם היעד (אופציונלי)</label>
        <input className="m-input" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder={cat?.name || 'שם היעד'} />
      </div>
      <div className="m-field">
        <label className="m-label">מסגרת זמן</label>
        <div className="m-pills">
          {TIME_FRAMES.map((t) => (
            <button key={t.k} type="button" className={`m-pill${form.time_frame === t.k ? ' on' : ''}`} onClick={() => set('time_frame', t.k)}>{t.l}</button>
          ))}
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">יעד</label>
          <input
            type="number"
            min="0"
            className={`m-input${err && !(parseFloat(form.target_value) > 0) ? ' err' : ''}`}
            value={form.target_value}
            onChange={(e) => { set('target_value', e.target.value); if (err) setErr('') }}
          />
        </div>
        {form.time_frame === 'deadline' && (
          <div className="m-field">
            <label className="m-label">תאריך יעד</label>
            <input type="date" className="m-input" value={form.target_date || ''} onChange={(e) => set('target_date', e.target.value)} />
          </div>
        )}
      </div>
      <div className="m-field">
        <label className="m-label">חשיבות</label>
        <div className="m-pills">
          {IMPORTANCE.map((n) => (
            <button key={n} type="button" className={`m-pill${Number(form.importance) === n ? ' on' : ''}`} onClick={() => set('importance', n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">פרויקט (אופציונלי)</label>
        <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
          <option value="">ללא</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {isManual && (
        <div className="m-field">
          <label className="m-label">מעקב</label>
          <div className="m-pills">
            <button type="button" className={`m-pill${form.tracking_method === 'manual' ? ' on' : ''}`} onClick={() => set('tracking_method', 'manual')}>הזנה ידנית</button>
            <button type="button" className={`m-pill${form.tracking_method === 'daily_question' ? ' on' : ''}`} onClick={() => set('tracking_method', 'daily_question')}>שאלה יומית</button>
          </div>
        </div>
      )}
      {byQuestion && (
        <div className="m-field">
          <label className="m-label">שאלה יומית</label>
          {activeQuestions.length ? (
            <select className="m-select" value={form.tracked_by_question_id} onChange={(e) => { set('tracked_by_question_id', e.target.value); if (err) setErr('') }}>
              <option value="">בחר/י שאלה</option>
              {activeQuestions.map((q) => <option key={q.id} value={q.id}>{q.icon ? q.icon + ' ' : ''}{questionText(q)}</option>)}
            </select>
          ) : (
            <p className="m-error">אין שאלות יומיות פעילות — הוסף/י שאלה בהגדרות.</p>
          )}
        </div>
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </Modal>
  )
}
