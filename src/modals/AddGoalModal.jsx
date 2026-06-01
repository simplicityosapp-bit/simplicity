import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { questionText } from '../lib/questionTemplates'
import { scheduledOccurrences } from '../lib/goals'

const TIME_FRAMES = [
  { k: 'monthly', l: 'חודשי' },
  { k: 'weekly', l: 'שבועי' },
  { k: 'deadline', l: 'עד תאריך' },
]
const IMPORTANCE = [1, 2, 3, 4, 5]
const blank = (categoryId = '') => ({
  category_id: categoryId,
  label: '',
  time_frame: 'monthly',
  target_value: '',
  target_date: '',
  importance: 3,
  project_id: '',
  tracking_method: 'manual',
  tracked_by_question_id: '',
})

/* onSave is async (Supabase insert). For manual categories the user picks a
   tracking method: manual entries, or linked to a daily question (D10). */
export default function AddGoalModal({ open, onClose, onSave, categories = [], projects = [], questions = [], defaultCategoryId = '' }) {
  const [form, setForm] = useState(() => blank(defaultCategoryId))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank(defaultCategoryId)); setErr(''); setBusy(false); onClose() }

  const selectedCat = categories.find((c) => c.id === form.category_id)
  const isManual = selectedCat?.measurement_type === 'manual'
  const byQuestion = isManual && form.tracking_method === 'daily_question'
  const activeQuestions = questions.filter((q) => q.active)

  /* When the goal tracks a yes/no question, that question's own schedule
     caps the target — you can't aim to say "yes" more times than it's
     asked. Sliders accumulate freely, so no cap. */
  const selectedQuestion = questions.find((q) => q.id === form.tracked_by_question_id)
  const isYesNo = byQuestion && selectedQuestion?.scale_type === 'yes_no'
  const maxOccurrences = isYesNo
    ? scheduledOccurrences(selectedQuestion.schedule_pattern, form.time_frame, form.target_date)
    : null
  const overMax = isYesNo && parseFloat(form.target_value) > maxOccurrences

  const submit = async () => {
    if (!form.category_id) { setErr('יש לבחור קטגוריה.'); return }
    const target = parseFloat(form.target_value)
    if (!target || target <= 0) { setErr('יש למלא יעד מספרי חיובי.'); return }
    if (form.time_frame === 'deadline' && !form.target_date) { setErr('יש לבחור תאריך יעד.'); return }
    if (byQuestion && !form.tracked_by_question_id) { setErr('יש לבחור שאלה יומית.'); return }
    if (overMax) { setErr(`היעד גבוה ממספר הימים שהשאלה מופיעה (${maxOccurrences}).`); return }
    setBusy(true)
    setErr('')
    try {
      await onSave({
        category_id: form.category_id,
        parent_goal_id: null,
        project_id: form.project_id || null,
        group_id: null,
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: byQuestion ? form.tracked_by_question_id : null,
        measurement_type: null,
        data_source: null,
        manual_input_type: null,
        schedule_pattern: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    }
  }

  return (
    <Modal open={open} onClose={close} title="יעד חדש">
      <div className="m-field">
        <label className="m-label">קטגוריה</label>
        <select className="m-select" value={form.category_id} onChange={(e) => { set('category_id', e.target.value); if (err) setErr('') }}>
          <option value="">בחר/י קטגוריה</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ? c.icon + ' ' : ''}{c.name}</option>)}
        </select>
      </div>
      <div className="m-field">
        <label className="m-label">שם היעד (אופציונלי)</label>
        <input className="m-input" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="לדוגמה: הכנסה חודשית" />
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
            placeholder="0"
          />
        </div>
        {form.time_frame === 'deadline' && (
          <div className="m-field">
            <label className="m-label">תאריך יעד</label>
            <input type="date" className="m-input" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
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
          {isYesNo && (
            overMax ? (
              <p className="m-sched-warn">
                <AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
                היעד ({parseFloat(form.target_value)}) גבוה ממספר הפעמים שהשאלה מופיעה ({maxOccurrences}). הקטן/י את היעד או שנה/י את לוח-הזמנים של השאלה.
              </p>
            ) : (
              <p className="m-hint">
                השאלה מופיעה כ-{maxOccurrences} פעמים ב{form.time_frame === 'weekly' ? 'שבוע' : form.time_frame === 'monthly' ? 'חודש' : 'תקופה'} — אפשר לכוון לפחות, לא ליותר.
              </p>
            )
          )}
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
