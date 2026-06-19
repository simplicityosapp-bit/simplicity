import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import DateField from '../components/DateField'
import ScheduleDayPicker from '../components/ScheduleDayPicker'
import { questionText } from '../lib/questionTemplates'
import { scheduledOccurrences, buildSchedulePattern } from '../lib/goals'
import { CATEGORY_PRESETS } from '../lib/goalPresets'
import { useT } from '../i18n/useT'

const IMPORTANCE = [1, 2, 3, 4, 5]
const QUESTION_ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

/* The metric is chosen here, not managed on the Goals screen: the system's
   auto-measured presets + one generic manual bucket. The parent (onSave)
   resolves the chosen key to a real category, creating it on demand. */
export const OTHER_METRIC_KEY = 'other'

const blank = () => ({
  metric_key: '',
  label: '',
  time_frame: 'monthly',
  target_value: '',
  target_date: '',
  importance: 3,
  project_id: '',
  group_id: '',
  tracking_method: 'manual',
  tracked_by_question_id: '',
  /* Daily-question authoring (used when tracking = daily_question). */
  question_mode: 'existing',   /* 'existing' = pick one · 'new' = write one */
  question_text: '',
  question_scale: '1-10',
  question_icon: QUESTION_ICONS[0],
  sched_mode: 'every_day',
  sched_days: [0, 1, 2, 3, 4, 5, 6],
  sched_x: 2,
})

/* onSave is async — it resolves metric_key to a category, then inserts the
   goal. For the manual metric ("אחר") the user picks a tracking method: manual
   entries, or linked to a daily question (yes/no or slider). */
export default function AddGoalModal({ open, onClose, onSave, projects = [], groups = [], questions = [], onAddQuestion }) {
  const { t, gender } = useT('modalsData')
  const TIME_FRAMES = [
    { k: 'monthly', l: t('addGoal.tf.monthly') },
    { k: 'weekly', l: t('addGoal.tf.weekly') },
    { k: 'deadline', l: t('addGoal.tf.deadline') },
  ]
  /* Inline daily-question creation (mirrors onboarding Step 6) — write your own
     question instead of only picking an existing one, choose slider / yes-no. */
  const SCALES = [
    { k: '1-10', l: t('addGoal.scale') },
    { k: 'yes_no', l: t('addGoal.yesNo') },
  ]
  const METRICS = [...CATEGORY_PRESETS, { key: OTHER_METRIC_KEY, name: t('addGoal.otherMetricName'), icon: '📝', measurement_type: 'manual' }]
  const [form, setForm] = useState(blank)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setForm(blank()); setErr(''); setBusy(false); onClose() }

  const selectedMetric = METRICS.find((m) => m.key === form.metric_key)
  const isManual = selectedMetric?.measurement_type === 'manual'
  const byQuestion = isManual && form.tracking_method === 'daily_question'
  const activeQuestions = questions.filter((q) => q.active)
  const hasActiveQ = activeQuestions.length > 0
  /* Authoring path: with no active question to pick, force "new"; otherwise
     honour the toggle. Inline creation needs the parent's onAddQuestion. */
  const canCreateQuestion = !!onAddQuestion
  const qMode = byQuestion ? (hasActiveQ && canCreateQuestion ? form.question_mode : (canCreateQuestion ? 'new' : 'existing')) : null
  const creatingQuestion = byQuestion && qMode === 'new'

  /* When the goal tracks a yes/no question, the question's schedule caps the
     target — you can't aim to say "yes" more times than it's asked. Sliders
     accumulate freely, so no cap. This handles BOTH a picked question (its
     stored schedule) and a brand-new one (the schedule being authored here). */
  const selectedQuestion = questions.find((q) => q.id === form.tracked_by_question_id)
  const newSchedPattern = creatingQuestion ? buildSchedulePattern(form.sched_mode, form.sched_days, form.sched_x) : null
  const noDays = creatingQuestion && form.sched_mode === 'days_of_week' && form.sched_days.length === 0
  const effIsYesNo = creatingQuestion
    ? form.question_scale === 'yes_no'
    : (byQuestion && selectedQuestion?.scale_type === 'yes_no')
  const effPattern = creatingQuestion ? newSchedPattern : selectedQuestion?.schedule_pattern
  const maxOccurrences = effIsYesNo
    ? scheduledOccurrences(effPattern, form.time_frame, form.target_date)
    : null
  const overMax = effIsYesNo && parseFloat(form.target_value) > maxOccurrences

  const submit = async () => {
    if (!form.metric_key) { setErr(t('addGoal.needMetric')); return }
    const target = parseFloat(form.target_value)
    if (!target || target <= 0) { setErr(t('addGoal.needTarget')); return }
    if (form.time_frame === 'deadline' && !form.target_date) { setErr(t('addGoal.needTargetDate')); return }
    if (byQuestion && creatingQuestion && !form.question_text.trim()) { setErr(t('addGoal.needQuestionText')); return }
    if (byQuestion && creatingQuestion && noDays) { setErr(t('addGoal.needAtLeastOneDay')); return }
    if (byQuestion && !creatingQuestion && !form.tracked_by_question_id) { setErr(t('addGoal.needQuestion')); return }
    if (overMax) { setErr(t('addGoal.overMaxError', { max: maxOccurrences })); return }
    setBusy(true)
    setErr('')
    try {
      /* Create the brand-new daily question first, then link the goal to it.
         Slider and yes/no both carry the chosen schedule (every-day = {}). */
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
      }
      await onSave({
        metric_key: form.metric_key,
        parent_goal_id: null,
        project_id: form.project_id || null,
        group_id: form.project_id && form.group_id ? form.group_id : null,
        label: form.label.trim() || null,
        time_frame: form.time_frame,
        target_value: target,
        target_date: form.time_frame === 'deadline' ? form.target_date : null,
        importance: Number(form.importance),
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: byQuestion ? questionId : null,
        measurement_type: null,
        data_source: null,
        manual_input_type: null,
        schedule_pattern: null,
      })
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('addGoal.title')}>
      <div className="m-field">
        <label className="m-label">{t('addGoal.metric')}</label>
        <select className="m-select" value={form.metric_key} onChange={(e) => { set('metric_key', e.target.value); if (err) setErr('') }}>
          <option value="">{t('addGoal.pickMetric')}</option>
          {METRICS.map((m) => <option key={m.key} value={m.key}>{m.icon ? m.icon + ' ' : ''}{m.name}</option>)}
        </select>
      </div>
      <div className="m-field">
        <label className="m-label">{t('addGoal.goalName')}</label>
        <input className="m-input" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder={t('addGoal.goalNamePlaceholder')} />
      </div>
      <div className="m-field">
        <label className="m-label">{t('addGoal.timeFrame')}</label>
        <div className="m-pills">
          {TIME_FRAMES.map((t) => (
            <button key={t.k} type="button" className={`m-pill${form.time_frame === t.k ? ' on' : ''}`} onClick={() => set('time_frame', t.k)}>{t.l}</button>
          ))}
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('addGoal.target')}</label>
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
            <label className="m-label">{t('addGoal.targetDate')}</label>
            <DateField value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
          </div>
        )}
      </div>
      <div className="m-field">
        <label className="m-label">{t('addGoal.importance')}</label>
        <div className="m-pills">
          {IMPORTANCE.map((n) => (
            <button key={n} type="button" className={`m-pill${Number(form.importance) === n ? ' on' : ''}`} onClick={() => set('importance', n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">{t('addGoal.projectOptional')}</label>
        <select className="m-select" value={form.project_id} onChange={(e) => { set('project_id', e.target.value); set('group_id', '') }}>
          <option value="">{t('common.none')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {form.project_id && groups.some((g) => g.project_id === form.project_id) && (
        <div className="m-field">
          <label className="m-label">{t('addGoal.groupOptional')}</label>
          <select className="m-select" value={form.group_id} onChange={(e) => set('group_id', e.target.value)}>
            <option value="">{t('addGoal.noGroup')}</option>
            {groups.filter((g) => g.project_id === form.project_id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {isManual && (
        <div className="m-field">
          <label className="m-label">{t('addGoal.tracking')}</label>
          <div className="m-pills">
            <button type="button" className={`m-pill${form.tracking_method === 'manual' ? ' on' : ''}`} onClick={() => set('tracking_method', 'manual')}>{t('addGoal.manualEntry')}</button>
            <button type="button" className={`m-pill${form.tracking_method === 'daily_question' ? ' on' : ''}`} onClick={() => set('tracking_method', 'daily_question')}>{t('addGoal.dailyQuestion')}</button>
          </div>
        </div>
      )}
      {byQuestion && (
        <div className="m-field">
          <label className="m-label">{t('addGoal.dailyQuestion')}</label>

          {/* Pick an existing question, or write a brand-new one inline. The
              toggle only shows when there's an existing question to pick AND
              the parent wired inline creation. */}
          {hasActiveQ && canCreateQuestion && (
            <div className="m-pills" style={{ marginBottom: 8 }}>
              <button type="button" className={`m-pill${qMode === 'existing' ? ' on' : ''}`} onClick={() => { set('question_mode', 'existing'); if (err) setErr('') }}>{t('addGoal.pickExisting')}</button>
              <button type="button" className={`m-pill${qMode === 'new' ? ' on' : ''}`} onClick={() => { set('question_mode', 'new'); if (err) setErr('') }}>{t('addGoal.newQuestion')}</button>
            </div>
          )}

          {qMode === 'existing' ? (
            hasActiveQ ? (
              <select className="m-select" value={form.tracked_by_question_id} onChange={(e) => { set('tracked_by_question_id', e.target.value); if (err) setErr('') }}>
                <option value="">{t('addGoal.pickQuestion')}</option>
                {activeQuestions.map((q) => <option key={q.id} value={q.id}>{q.icon ? q.icon + ' ' : ''}{questionText(q, gender)}</option>)}
              </select>
            ) : (
              <p className="m-error">{t('addGoal.noActiveQuestions')}</p>
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
        <button type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </Modal>
  )
}
