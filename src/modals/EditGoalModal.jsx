import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import DateField from '../components/DateField'
import ScheduleDayPicker from '../components/ScheduleDayPicker'
import Modal from './Modal'
import { questionText } from '../lib/questionTemplates'
import { scheduledOccurrences, buildSchedulePattern } from '../lib/goals'
import { useT } from '../i18n/useT'

const IMPORTANCE = [1, 2, 3, 4, 5]
const QUESTION_ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

/* Reverse of buildSchedulePattern — turn a stored schedule_pattern back into
   the ScheduleDayPicker's {mode, days, x} so editing a question pre-fills its
   real cadence (null/empty = every day). */
const patternToSched = (p) => {
  if (p && p.type === 'days_of_week' && Array.isArray(p.values) && p.values.length) {
    return { mode: 'days_of_week', days: p.values, x: 2 }
  }
  if (p && p.type === 'every_x_days') {
    return { mode: 'every_x_days', days: [0, 1, 2, 3, 4, 5, 6], x: Number(p.x) || 2 }
  }
  return { mode: 'every_day', days: [0, 1, 2, 3, 4, 5, 6], x: 2 }
}

/* Edit a goal — label / time_frame / target / importance / project / tracking
   (manual vs daily question for manual categories). For question-tracked goals
   the linked question can be re-picked, created fresh inline, or edited in
   place (text / answer type / icon / schedule). */
export default function EditGoalModal({ open, onClose, onSave, onDelete, goal, categories = [], projects = [], groups = [], questions = [], onAddQuestion, onUpdateQuestion }) {
  const { t, gender } = useT('modalsData')
  const TIME_FRAMES = [
    { k: 'monthly', l: t('editGoal.tf.monthly') },
    { k: 'weekly', l: t('editGoal.tf.weekly') },
    { k: 'deadline', l: t('editGoal.tf.deadline') },
  ]
  const SCALES = [
    { k: '1-10', l: t('addGoal.scale') },
    { k: 'yes_no', l: t('addGoal.yesNo') },
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
    /* Daily-question authoring (used when question_mode is 'new' or 'edit'). */
    question_mode: 'existing',   /* 'existing' = pick · 'new' = write · 'edit' = change the linked one */
    question_text: '',
    question_scale: '1-10',
    question_icon: QUESTION_ICONS[0],
    sched_mode: 'every_day',
    sched_days: [0, 1, 2, 3, 4, 5, 6],
    sched_x: 2,
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (!goal) return <Modal open={open} onClose={onClose} title={t('editGoal.title')} />

  const cat = categories.find((c) => c.id === goal.category_id)
  const isManual = cat?.measurement_type === 'manual'
  const byQuestion = isManual && form.tracking_method === 'daily_question'
  const activeQuestions = questions.filter((q) => q.active)
  const hasActiveQ = activeQuestions.length > 0
  const canCreateQuestion = !!onAddQuestion
  const canEditQuestion = !!onUpdateQuestion
  const linkedQuestion = questions.find((q) => q.id === form.tracked_by_question_id) || null

  /* Resolve the authoring mode, falling back gracefully when an option isn't
     available (no edit handler, nothing linked yet, or no question to pick). */
  let qMode = byQuestion ? form.question_mode : null
  if (byQuestion) {
    if (qMode === 'edit' && !(canEditQuestion && linkedQuestion)) qMode = 'existing'
    if (qMode === 'new' && !canCreateQuestion) qMode = 'existing'
    if (qMode === 'existing' && !hasActiveQ) qMode = canCreateQuestion ? 'new' : 'existing'
  }
  const creatingQuestion = qMode === 'new'
  const editingQuestion = qMode === 'edit'
  const authoring = creatingQuestion || editingQuestion

  /* Prefill the authoring fields from the linked question when entering edit
     mode; clear them when starting a brand-new one. */
  const startEdit = () => {
    if (!linkedQuestion) return
    const s = patternToSched(linkedQuestion.schedule_pattern)
    setForm((f) => ({
      ...f,
      question_mode: 'edit',
      question_text: questionText(linkedQuestion, gender),
      question_scale: linkedQuestion.scale_type || '1-10',
      question_icon: linkedQuestion.icon || QUESTION_ICONS[0],
      sched_mode: s.mode,
      sched_days: s.days,
      sched_x: s.x,
    }))
    if (err) setErr('')
  }
  const startNew = () => {
    setForm((f) => ({
      ...f,
      question_mode: 'new',
      question_text: '',
      question_scale: '1-10',
      question_icon: QUESTION_ICONS[0],
      sched_mode: 'every_day',
      sched_days: [0, 1, 2, 3, 4, 5, 6],
      sched_x: 2,
    }))
    if (err) setErr('')
  }

  /* Yes/no goals cap at how often the question is asked in the period (same
     rule as AddGoalModal) — using the authored schedule when creating/editing,
     else the picked question's stored one. */
  const selectedQuestion = questions.find((q) => q.id === form.tracked_by_question_id)
  const newSchedPattern = authoring ? buildSchedulePattern(form.sched_mode, form.sched_days, form.sched_x) : null
  const noDays = authoring && form.sched_mode === 'days_of_week' && form.sched_days.length === 0
  const effIsYesNo = authoring
    ? form.question_scale === 'yes_no'
    : (byQuestion && selectedQuestion?.scale_type === 'yes_no')
  const effPattern = authoring ? newSchedPattern : selectedQuestion?.schedule_pattern
  const maxOccurrences = effIsYesNo
    ? scheduledOccurrences(effPattern, form.time_frame, form.target_date)
    : null
  const overMax = effIsYesNo && parseFloat(form.target_value) > maxOccurrences

  const submit = async () => {
    const target = parseFloat(form.target_value)
    if (!target || target <= 0) { setErr(t('editGoal.needTarget')); return }
    if (form.time_frame === 'deadline' && !form.target_date) { setErr(t('editGoal.needTargetDate')); return }
    if (byQuestion && authoring && !form.question_text.trim()) { setErr(t('addGoal.needQuestionText')); return }
    if (byQuestion && authoring && noDays) { setErr(t('addGoal.needAtLeastOneDay')); return }
    if (byQuestion && !authoring && !form.tracked_by_question_id) { setErr(t('editGoal.needQuestion')); return }
    if (overMax) { setErr(t('addGoal.overMaxError', { max: maxOccurrences })); return }
    setBusy(true)
    setErr('')
    try {
      let questionId = form.tracked_by_question_id
      if (byQuestion && creatingQuestion) {
        const q = await onAddQuestion({
          template_key: null,
          custom_text: form.question_text.trim(),
          scale_type: form.question_scale,
          icon: form.question_icon,
          active: true,
          schedule_pattern: newSchedPattern || {},
        })
        questionId = q.id
      } else if (byQuestion && editingQuestion && linkedQuestion) {
        await onUpdateQuestion(linkedQuestion.id, {
          template_key: null,
          custom_text: form.question_text.trim(),
          scale_type: form.question_scale,
          icon: form.question_icon,
          schedule_pattern: newSchedPattern || {},
        })
        questionId = linkedQuestion.id
      }
      await onSave(goal.id, {
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        project_id: form.project_id || null,
        group_id: form.project_id && form.group_id ? form.group_id : null,
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: byQuestion ? questionId : null,
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
          {TIME_FRAMES.map((tf) => (
            <button key={tf.k} type="button" className={`m-pill${form.time_frame === tf.k ? ' on' : ''}`} onClick={() => set('time_frame', tf.k)}>{tf.l}</button>
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

          {/* Pick an existing question, write a new one, or edit the linked one.
              Each pill shows only when its action is available. */}
          {(hasActiveQ + (canCreateQuestion ? 1 : 0) + (canEditQuestion && linkedQuestion ? 1 : 0)) > 1 && (
            <div className="m-pills" style={{ marginBottom: 8 }}>
              {hasActiveQ && (
                <button type="button" className={`m-pill${qMode === 'existing' ? ' on' : ''}`} onClick={() => { set('question_mode', 'existing'); if (err) setErr('') }}>{t('addGoal.pickExisting')}</button>
              )}
              {canCreateQuestion && (
                <button type="button" className={`m-pill${qMode === 'new' ? ' on' : ''}`} onClick={startNew}>{t('addGoal.newQuestion')}</button>
              )}
              {canEditQuestion && linkedQuestion && (
                <button type="button" className={`m-pill${qMode === 'edit' ? ' on' : ''}`} onClick={startEdit}>{t('editGoal.editQuestion')}</button>
              )}
            </div>
          )}

          {qMode === 'existing' ? (
            hasActiveQ ? (
              <select className="m-select" value={form.tracked_by_question_id} onChange={(e) => { set('tracked_by_question_id', e.target.value); if (err) setErr('') }}>
                <option value="">{t('editGoal.pickQuestion')}</option>
                {activeQuestions.map((q) => <option key={q.id} value={q.id}>{q.icon ? q.icon + ' ' : ''}{questionText(q, gender)}</option>)}
              </select>
            ) : (
              <p className="m-error">{t('editGoal.noActiveQuestions')}</p>
            )
          ) : (
            <>
              <input
                className="m-input"
                value={form.question_text}
                onChange={(e) => { set('question_text', e.target.value); if (err) setErr('') }}
                placeholder={form.question_scale === 'yes_no' ? t('addGoal.questionPlaceholderYesNo') : t('addGoal.questionPlaceholderSlider')}
              />
              <div style={{ marginTop: 8 }}>
                <label className="m-label">{t('addGoal.answerType')}</label>
                <div className="m-pills">
                  {SCALES.map((s) => (
                    <button key={s.k} type="button" className={`m-pill${form.question_scale === s.k ? ' on' : ''}`} onClick={() => set('question_scale', s.k)}>{s.l}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label className="m-label">{t('common.icon')}</label>
                <div className="m-pills">
                  {QUESTION_ICONS.map((ic) => (
                    <button key={ic} type="button" className={`m-pill${form.question_icon === ic ? ' on' : ''}`} onClick={() => set('question_icon', ic)} aria-label={t('addGoal.iconAria', { icon: ic })}>{ic}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label className="m-label">{t('addGoal.whenAsked')}</label>
                <ScheduleDayPicker
                  mode={form.sched_mode}
                  days={form.sched_days}
                  x={form.sched_x}
                  onChange={({ mode, days, x }) => { set('sched_mode', mode); set('sched_days', days); set('sched_x', x) }}
                />
              </div>
            </>
          )}

          {effIsYesNo && (
            overMax ? (
              <p className="m-sched-warn">
                <AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
                {t('addGoal.overMaxWarn', { target: parseFloat(form.target_value), max: maxOccurrences })}
              </p>
            ) : (
              <p className="m-hint">
                {t('addGoal.freqHint', { max: maxOccurrences, period: t(`addGoal.period.${form.time_frame}`) })}
              </p>
            )
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
