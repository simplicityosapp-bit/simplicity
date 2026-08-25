import { useState } from 'react'
import { AlertTriangle, SlidersHorizontal } from 'lucide-react'
import Modal from './Modal'
import { useDiscardGuard, isDirty, useScrollToError, useFormDraft } from './useDiscardGuard'
import SelectMenu from '../components/SelectMenu'
import FormSection from '../components/FormSection'
import DateField from '../components/DateField'
import ScheduleDayPicker from '../components/ScheduleDayPicker'
import { questionText, scheduledOccurrences, buildSchedulePattern } from '@simplicity/core'
import { CATEGORY_PRESETS } from '../lib/goalPresets'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

const IMPORTANCE = [1, 2, 3, 4, 5]
const QUESTION_ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

/* The metric is chosen here, not managed on the Goals screen: the system's
   auto-measured presets + one generic manual bucket. The parent (onSave)
   resolves the chosen key to a real category, creating it on demand. */
export const OTHER_METRIC_KEY = 'other'

/* `initialProject` pre-fills the project for callers that open this form from
   inside one. A SEED, not a lock — the picker stays live and what the user
   leaves in it is what gets saved. */
const blank = (initialProject = '') => ({
  metric_key: '',
  label: '',
  time_frame: 'monthly',
  target_value: '',
  target_date: '',
  importance: 3,
  project_id: initialProject || '',
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
export default function AddGoalModal({ open, onClose, onSave, projects = [], groups = [], questions = [], onAddQuestion, initialProject = '' }) {
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
  const [form, setForm] = useState(() => blank(initialProject))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /* Opens showing the details lid when something inside it already carries a
     value — here, a project seeded by the caller — so a seeded value is never
     hidden behind a closed lid. */
  const [detailsOpen, setDetailsOpen] = useState(!!initialProject)
  const close = () => { setForm(blank(initialProject)); setDetailsOpen(!!initialProject); setErr(''); setBusy(false); onClose() }
  /* The four shared behaviours the lead, task and transaction forms have had
     since 09/08 and this one — the LONGEST add form in the app — had none of.
     Closing it binned a fully written-out goal without a word and with nothing
     to come back to. This form only ever creates, so the draft has no edit case
     to guard against. */
  const draft = useFormDraft({
    name: 'goal',
    form,
    setForm,
    blank: blank(initialProject),
    enabled: open,
    /* seed feeds the draft's storage KEY — added only when a project was
       actually seeded, so the plain callers keep the key they already use. */
    seed: initialProject ? { project: initialProject } : undefined,
  })
  const guard = useDiscardGuard(isDirty(form, blank(initialProject)), () => { draft.clear(); close() })
  /* A rejected save should put the field it rejected back on screen. */
  useScrollToError(err)

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
      draft.clear()
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  /* SelectMenu wants {value,label}; these were four raw <select>s. */
  const noneOpt = { value: '', label: t('common.none') }
  const metricOptions = [
    { value: '', label: t('addGoal.pickMetric') },
    ...METRICS.map((m) => ({ value: m.key, label: (m.icon ? m.icon + ' ' : '') + m.name })),
  ]
  const projectOptions = [noneOpt, ...projects.map((p) => ({ value: p.id, label: p.name }))]
  const groupOptions = [
    { value: '', label: t('addGoal.noGroup') },
    ...groups.filter((g) => g.project_id === form.project_id).map((g) => ({ value: g.id, label: g.name })),
  ]
  const questionOptions = [
    { value: '', label: t('addGoal.pickQuestion') },
    ...activeQuestions.map((q) => ({ value: q.id, label: (q.icon ? q.icon + ' ' : '') + questionText(q, gender) })),
  ]

  return (
    <>
    <Modal open={open} onClose={guard.requestClose} onSubmit={submit} title={t('addGoal.title')}>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGoal.metric')}</Box>
        <SelectMenu value={form.metric_key} onChange={(v) => { set('metric_key', v); if (err) setErr('') }} options={metricOptions} placeholder={t('addGoal.pickMetric')} ariaLabel={t('addGoal.metric')} />
      </Box>
      <Box className="m-field">
        {/* htmlFor/id: m-label sits beside its control rather than wrapping it,
            so without this pairing the field has no accessible name at all. */}
        <Box as="label" className="m-label" htmlFor="goal-name">{t('addGoal.goalName')}</Box>
        <Input id="goal-name" className="m-input" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder={t('addGoal.goalNamePlaceholder')} />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('addGoal.timeFrame')}</Box>
        <Box className="m-pills">
          {TIME_FRAMES.map((t) => (
            <Btn key={t.k} type="button" className={`m-pill${form.time_frame === t.k ? ' on' : ''}`} onClick={() => set('time_frame', t.k)}>{t.l}</Btn>
          ))}
        </Box>
      </Box>
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label" htmlFor="goal-target">{t('addGoal.target')}</Box>
          <Input
            id="goal-target"
            type="number"
            min="0"
            className={`m-input${err && !(parseFloat(form.target_value) > 0) ? ' err' : ''}`}
            value={form.target_value}
            onChange={(e) => { set('target_value', e.target.value); if (err) setErr('') }}
            placeholder="0"
          />
        </Box>
        {form.time_frame === 'deadline' && (
          <Box className="m-field">
            <Box as="label" className="m-label" htmlFor="goal-target-date">{t('addGoal.targetDate')}</Box>
            <DateField id="goal-target-date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)} />
          </Box>
        )}
      </Box>
      {/* What the goal IS — its metric, name, window and number — stays in the
          open. How much it matters and where it belongs go behind the same lid
          the lead, task and transaction forms use; this form had none, and it
          is the one with the most optional half. Closed by default: importance
          has a working default of 3 and both pickers are genuinely optional. */}
      <FormSection
        id="goal-details"
        icon={<SlidersHorizontal size={16} strokeWidth={1.7} />}
        title={t('addGoal.moreDetails')}
        open={detailsOpen}
        onToggle={() => setDetailsOpen((o) => !o)}
      >
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGoal.importance')}</Box>
          <Box className="m-pills">
            {IMPORTANCE.map((n) => (
              <Btn key={n} type="button" className={`m-pill${Number(form.importance) === n ? ' on' : ''}`} onClick={() => set('importance', n)}>{n}</Btn>
            ))}
          </Box>
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGoal.projectOptional')}</Box>
          <SelectMenu value={form.project_id} onChange={(v) => { set('project_id', v); set('group_id', '') }} options={projectOptions} placeholder={t('common.none')} ariaLabel={t('addGoal.projectOptional')} />
        </Box>
        {form.project_id && groups.some((g) => g.project_id === form.project_id) && (
          <Box className="m-field">
            <Box as="label" className="m-label">{t('addGoal.groupOptional')}</Box>
            <SelectMenu value={form.group_id} onChange={(v) => set('group_id', v)} options={groupOptions} placeholder={t('addGoal.noGroup')} ariaLabel={t('addGoal.groupOptional')} />
          </Box>
        )}
      </FormSection>

      {isManual && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGoal.tracking')}</Box>
          <Box className="m-pills">
            <Btn type="button" className={`m-pill${form.tracking_method === 'manual' ? ' on' : ''}`} onClick={() => set('tracking_method', 'manual')}>{t('addGoal.manualEntry')}</Btn>
            <Btn type="button" className={`m-pill${form.tracking_method === 'daily_question' ? ' on' : ''}`} onClick={() => set('tracking_method', 'daily_question')}>{t('addGoal.dailyQuestion')}</Btn>
          </Box>
        </Box>
      )}
      {byQuestion && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('addGoal.dailyQuestion')}</Box>

          {/* Pick an existing question, or write a brand-new one inline. The
              toggle only shows when there's an existing question to pick AND
              the parent wired inline creation. */}
          {hasActiveQ && canCreateQuestion && (
            <Box className="m-pills" style={{ marginBottom: 8 }}>
              <Btn type="button" className={`m-pill${qMode === 'existing' ? ' on' : ''}`} onClick={() => { set('question_mode', 'existing'); if (err) setErr('') }}>{t('addGoal.pickExisting')}</Btn>
              <Btn type="button" className={`m-pill${qMode === 'new' ? ' on' : ''}`} onClick={() => { set('question_mode', 'new'); if (err) setErr('') }}>{t('addGoal.newQuestion')}</Btn>
            </Box>
          )}

          {qMode === 'existing' ? (
            hasActiveQ ? (
              <SelectMenu value={form.tracked_by_question_id} onChange={(v) => { set('tracked_by_question_id', v); if (err) setErr('') }} options={questionOptions} placeholder={t('addGoal.pickQuestion')} ariaLabel={t('addGoal.dailyQuestion')} />
            ) : (
              <Txt as="p" className="m-error">{t('addGoal.noActiveQuestions')}</Txt>
            )
          ) : (
            <>
              <Input
                aria-label={t('addGoal.dailyQuestion')}
                className="m-input"
                value={form.question_text}
                onChange={(e) => { set('question_text', e.target.value); if (err) setErr('') }}
                placeholder={form.question_scale === 'yes_no' ? t('addGoal.questionPlaceholderYesNo') : t('addGoal.questionPlaceholderSlider')}
              />
              <Box style={{ marginTop: 8 }}>
                <Box as="label" className="m-label">{t('addGoal.answerType')}</Box>
                <Box className="m-pills">
                  {SCALES.map((s) => (
                    <Btn key={s.k} type="button" className={`m-pill${form.question_scale === s.k ? ' on' : ''}`} onClick={() => set('question_scale', s.k)}>{s.l}</Btn>
                  ))}
                </Box>
              </Box>
              <Box style={{ marginTop: 8 }}>
                <Box as="label" className="m-label">{t('common.icon')}</Box>
                <Box className="m-pills">
                  {QUESTION_ICONS.map((ic) => (
                    <Btn key={ic} type="button" className={`m-pill${form.question_icon === ic ? ' on' : ''}`} onClick={() => set('question_icon', ic)} aria-label={t('addGoal.iconAria', { icon: ic })}>{ic}</Btn>
                  ))}
                </Box>
              </Box>
              <Box style={{ marginTop: 8 }}>
                <Box as="label" className="m-label">{t('addGoal.whenAsked')}</Box>
                <ScheduleDayPicker
                  mode={form.sched_mode}
                  days={form.sched_days}
                  x={form.sched_x}
                  onChange={({ mode, days, x }) => { set('sched_mode', mode); set('sched_days', days); set('sched_x', x) }}
                />
              </Box>
            </>
          )}

          {effIsYesNo && (
            overMax ? (
              <Txt as="p" className="m-warn">
                <AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
                {t('addGoal.overMaxWarn', { target: parseFloat(form.target_value), max: maxOccurrences })}
              </Txt>
            ) : (
              <Txt as="p" className="m-hint">
                {t('addGoal.freqHint', { max: maxOccurrences, period: t(`addGoal.period.${form.time_frame}`) })}
              </Txt>
            )
          )}
        </Box>
      )}

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={guard.requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>

    {/* Sibling of the sheet, never a child — every .m-sheet shares z-index 510,
        so paint order is DOM order. */}
    {guard.confirm}
    </>
  )
}
