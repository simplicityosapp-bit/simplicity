import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { questionText } from '../lib/questionTemplates'
import { useT } from '../i18n/useT'

const IMPORTANCE = [1, 2, 3, 4, 5]

/* Edit a goal — label / time_frame / target / importance / project / tracking
   (manual vs daily question for manual categories). */
export default function EditGoalModal({ open, onClose, onSave, onDelete, goal, categories = [], projects = [], groups = [], questions = [] }) {
  const { t } = useT('modalsData')
  const TIME_FRAMES = [
    { k: 'monthly', l: t('editGoal.tf.monthly') },
    { k: 'weekly', l: t('editGoal.tf.weekly') },
    { k: 'deadline', l: t('editGoal.tf.deadline') },
  ]
  const [form, setForm] = useState(() => ({
    label: goal?.label || '',
    time_frame: goal?.time_frame || 'monthly',
    target_value: goal?.target_value ?? '',
    target_date: goal?.target_date || '',
    importance: goal?.importance ?? 3,
    project_id: goal?.project_id || '',
    group_id: goal?.group_id || '',
    tracking_method: goal?.tracking_method || 'manual',
    tracked_by_question_id: goal?.tracked_by_question_id || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!goal) return <Modal open={open} onClose={onClose} title={t('editGoal.title')} />

  const cat = categories.find((c) => c.id === goal.category_id)
  const isManual = cat?.measurement_type === 'manual'
  const byQuestion = isManual && form.tracking_method === 'daily_question'
  const activeQuestions = questions.filter((q) => q.active)

  const submit = async () => {
    const target = parseFloat(form.target_value)
    if (!target || target <= 0) { setErr(t('editGoal.needTarget')); return }
    if (form.time_frame === 'deadline' && !form.target_date) { setErr(t('editGoal.needTargetDate')); return }
    if (byQuestion && !form.tracked_by_question_id) { setErr(t('editGoal.needQuestion')); return }
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
        group_id: form.project_id && form.group_id ? form.group_id : null,
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: byQuestion ? form.tracked_by_question_id : null,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('editGoal.title')}>
      <div className="m-field">
        <label className="m-label">{t('editGoal.goalName')}</label>
        <input className="m-input" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder={cat?.name || t('editGoal.goalNamePlaceholder')} />
      </div>
      <div className="m-field">
        <label className="m-label">{t('editGoal.timeFrame')}</label>
        <div className="m-pills">
          {TIME_FRAMES.map((t) => (
            <button key={t.k} type="button" className={`m-pill${form.time_frame === t.k ? ' on' : ''}`} onClick={() => set('time_frame', t.k)}>{t.l}</button>
          ))}
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('editGoal.target')}</label>
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
            <label className="m-label">{t('editGoal.targetDate')}</label>
            <DateField value={form.target_date || ''} onChange={(e) => set('target_date', e.target.value)} />
          </div>
        )}
      </div>
      <div className="m-field">
        <label className="m-label">{t('editGoal.importance')}</label>
        <div className="m-pills">
          {IMPORTANCE.map((n) => (
            <button key={n} type="button" className={`m-pill${Number(form.importance) === n ? ' on' : ''}`} onClick={() => set('importance', n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">{t('editGoal.projectOptional')}</label>
        <select className="m-select" value={form.project_id} onChange={(e) => { set('project_id', e.target.value); set('group_id', '') }}>
          <option value="">{t('common.none')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {form.project_id && groups.some((g) => g.project_id === form.project_id) && (
        <div className="m-field">
          <label className="m-label">{t('editGoal.groupOptional')}</label>
          <select className="m-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
            <option value="">{t('editGoal.noGroup')}</option>
            {groups.filter((g) => g.project_id === form.project_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {isManual && (
        <div className="m-field">
          <label className="m-label">{t('editGoal.tracking')}</label>
          <div className="m-pills">
            <button type="button" className={`m-pill${form.tracking_method === 'manual' ? ' on' : ''}`} onClick={() => set('tracking_method', 'manual')}>{t('editGoal.manualEntry')}</button>
            <button type="button" className={`m-pill${form.tracking_method === 'daily_question' ? ' on' : ''}`} onClick={() => set('tracking_method', 'daily_question')}>{t('editGoal.dailyQuestion')}</button>
          </div>
        </div>
      )}
      {byQuestion && (
        <div className="m-field">
          <label className="m-label">{t('editGoal.dailyQuestion')}</label>
          {activeQuestions.length ? (
            <select className="m-select" value={form.tracked_by_question_id} onChange={(e) => { set('tracked_by_question_id', e.target.value); if (err) setErr('') }}>
              <option value="">{t('editGoal.pickQuestion')}</option>
              {activeQuestions.map((q) => <option key={q.id} value={q.id}>{q.icon ? q.icon + ' ' : ''}{questionText(q)}</option>)}
            </select>
          ) : (
            <p className="m-error">{t('editGoal.noActiveQuestions')}</p>
          )}
        </div>
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
      {onDelete && (
        <button type="button" className="m-btn-delete" onClick={() => onDelete(goal)}>
          <Trash2 size={15} strokeWidth={1.7} aria-hidden="true" /> {t('editGoal.deleteGoal')}
        </button>
      )}
    </Modal>
  )
}
