import { useEffect, useState } from 'react'
import { Star, AlertTriangle } from 'lucide-react'
import DateField from '../../../components/DateField'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useProjects } from '../../../hooks/useProjects'
import { useUserQuestions } from '../../../hooks/useUserQuestions'
import { CATEGORY_PRESETS, presetToCategory } from '../../../lib/goalPresets'
import { scheduledOccurrences, buildSchedulePattern } from '@simplicity/core'
import { useT } from '../../../i18n/useT'
import ScheduleDayPicker from '../../../components/ScheduleDayPicker'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* Step 6 — first goal, faithful to the in-app AddGoalModal:
   - every auto category the app supports (derived from CATEGORY_PRESETS,
     so new presets show up here automatically) + a personal track
   - time frame is monthly / weekly / "until a date" (deadline) for ALL
     goals, exactly like in-app — with a date field when deadline
   - a live goal card previews what's being created
   Personal goals add name + tracking method (manual / daily question). */

/* Auto categories come straight from the canonical preset catalog so the
   onboarding can never fall behind the app. Personal is appended. Auto
   labels/hints come from the preset catalog (lib, i18n-resolved); the
   personal track's label/hint are translated per-render inside the
   component. Built lazily per-render (see TYPES) so the i18n name/hint
   getters resolve in the active language rather than module-load language. */

const TIME_FRAMES = [
  { k: 'monthly',  labelKey: 'step6.tfMonthly' },
  { k: 'weekly',   labelKey: 'step6.tfWeekly' },
  { k: 'deadline', labelKey: 'step6.tfDeadline' },
]
const TRACKING = [
  { k: 'manual',         labelKey: 'step6.trackingManual' },
  { k: 'daily_question', labelKey: 'step6.trackingQuestion' },
]
const SCALES = [
  { k: '1-10',  labelKey: 'step6.scale110' },
  { k: 'yes_no', labelKey: 'step6.scaleYesNo' },
]
const QUESTION_ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

export default function Step6Goals({ ob, setCTA }) {
  const { t, lang } = useT('onboardingSteps')
  /* Number grouping follows the active UI language (matches lib/goals formatGoal),
     so a Spanish/English user doesn't see Hebrew-locale formatting. */
  const numLocale = lang === 'he' ? 'he-IL' : (lang || 'he-IL')
  /* Personal track appended to the auto categories; its label/hint are
     translated (auto types resolve their lib-sourced preset name/hint via
     i18n at render-time, so they follow the active language). */
  const AUTO_TYPES = CATEGORY_PRESETS.map((p) => ({ key: p.key, label: p.name, icon: p.icon, hint: p.hint, auto: true }))
  const TYPES = [...AUTO_TYPES, { key: 'personal', label: t('step6.personalLabel'), icon: '✍️', hint: t('step6.personalHint'), auto: false }]
  const { addGoal } = useGoals()
  const { categories, addCategory } = useGoalCategories()
  const { projects } = useProjects()
  const { addQuestion } = useUserQuestions()

  const initial = ob.state.answers?.goals || {}
  const [projectId, setProjectId]   = useState(initial.project_id || '')
  const [type, setType]             = useState(initial.first_type || null)
  const [target, setTarget]         = useState(initial.first_target || '')
  const [timeFrame, setTimeFrame]   = useState(initial.time_frame || 'monthly')
  const [targetDate, setTargetDate] = useState(initial.target_date || '')
  const [importance, setImportance] = useState(Number(initial.importance) || 3)
  /* Personal-goal extras (collapsed when an auto type is picked). */
  const [label, setLabel]           = useState(initial.personal_label || '')
  const [tracking, setTracking]     = useState(initial.tracking || 'manual')
  /* Daily-question extras (collapsed unless tracking = daily_question). */
  const [qText, setQText]   = useState(initial.question_text || '')
  const [qScale, setQScale] = useState(initial.question_scale || '1-10')
  const [qIcon, setQIcon]   = useState(initial.question_icon || QUESTION_ICONS[0])
  /* Schedule for a yes/no daily-question goal — which days the question
     is asked. Drives the max sensible target (you can't aim to say "yes"
     more times than the question appears). */
  const [schedMode, setSchedMode] = useState(initial.sched_mode || 'every_day')
  const [schedDays, setSchedDays] = useState(initial.sched_days || [0, 1, 2, 3, 4, 5, 6])
  const [schedX, setSchedX]       = useState(initial.sched_x || 2)

  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const isPersonal   = type === 'personal'
  const byQuestion   = isPersonal && tracking === 'daily_question'
  const isYesNoGoal  = byQuestion && qScale === 'yes_no'
  const isDeadline   = timeFrame === 'deadline'
  const targetNum    = Number(target)

  /* The day picker shows for ANY daily-question goal (slider too) — the
     user chooses when to be asked. The schedule only CAPS the target for
     yes/no goals (you can't say "yes" more times than asked); sliders
     accumulate freely, so no cap. */
  const schedPattern = byQuestion ? buildSchedulePattern(schedMode, schedDays, schedX) : null
  const maxOccurrences = byQuestion ? scheduledOccurrences(schedPattern, timeFrame, targetDate) : null
  const overMax = isYesNoGoal && targetNum > maxOccurrences
  const noDays = byQuestion && schedMode === 'days_of_week' && schedDays.length === 0

  const canAdvance   = !!type && targetNum > 0
    && (!isDeadline || !!targetDate)
    && (!isPersonal || label.trim().length > 0)
    && (!byQuestion || qText.trim().length > 0)
    && !overMax && !noDays
  const hint = !type ? t('step6.hintPickType')
    : targetNum <= 0 ? t('step6.hintPositive')
    : (isDeadline && !targetDate) ? t('step6.hintPickDate')
    : (isPersonal && !label.trim()) ? t('step6.hintNameGoal')
    : (byQuestion && !qText.trim()) ? t('step6.hintPhraseQuestion')
    : noDays ? t('step6.noDays')
    : overMax ? t('step6.hintOverMax', { max: maxOccurrences })
    : null
  /* Deps coerced to stable primitives — never undefined — so the array
     keeps a constant length across renders (React requires this). */
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) },
    [type || '', target || '', timeFrame, targetDate || '', importance, label || '', tracking, qText || '', qScale, qIcon, schedMode, schedDays.length, schedX, projectId || '', busy, canAdvance, hint || '']) // eslint-disable-line react-hooks/exhaustive-deps

  /* Dynamic explainer under the target field — what the number means
     depends on how the goal is measured (count of "yes" days, sum of
     slider answers, or a plain accumulation). */
  const targetHelp = isYesNoGoal
    ? t('step6.targetHelpYesNo', { verb: t('step6.targetHelpYesNoVerb'), max: maxOccurrences })
    : byQuestion
      ? t('step6.targetHelpQuestion')
      : isPersonal
        ? t('step6.targetHelpPersonal', { verb: t('step6.targetHelpPersonalVerb') })
        : null

  /* Inline warning next to the day picker when a yes/no target can't be
     met by the chosen days (fewer scheduled days than the target). */
  const scheduleWarning = isYesNoGoal && overMax
    ? t('step6.scheduleWarnOver', { target: targetNum, max: maxOccurrences, verb: t('step6.scheduleWarnOverVerb') })
    : noDays
      ? t('step6.noDays')
      : null

  /* Find-or-create the goal category for the picked type. Auto types use
     the CATEGORY_PRESETS shape (same path as the in-app category picker);
     personal falls back to a custom manual category. */
  const resolveCategoryId = async () => {
    if (isPersonal) {
      const existing = categories.find((c) => !c.builtin && c.measurement_type === 'manual' && c.name === 'אישי')
      if (existing) return existing.id
      const created = await addCategory({
        key: null, name: 'אישי', icon: '✍️', color: '#7a5cb8',
        measurement_type: 'manual', data_source: null, graph_type: 'delta', builtin: false,
      })
      return created.id
    }
    const existing = categories.find((c) => c.key === type)
    if (existing) return existing.id
    const preset = CATEGORY_PRESETS.find((p) => p.key === type)
    if (!preset) throw new Error('preset not found')
    const created = await addCategory(presetToCategory(preset))
    return created.id
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const samePrev = initial.first_type === type
        && Number(initial.first_target) === targetNum
        && (initial.project_id || '') === projectId
        && (initial.time_frame || 'monthly') === timeFrame
        && (initial.tracking || 'manual') === tracking
      if (samePrev && (initial.created_ids?.length || 0) > 0) {
        await ob.advance()
        return
      }
      let questionId = null
      if (byQuestion && qText.trim()) {
        const q = await addQuestion({
          template_key: null, custom_text: qText.trim(), scale_type: qScale,
          icon: qIcon, active: true,
          /* Both slider and yes/no questions carry the chosen schedule;
             null pattern (every day) is stored as {}. */
          schedule_pattern: schedPattern || {},
        })
        questionId = q.id
      }
      const categoryId = await resolveCategoryId()
      const goal = await addGoal({
        category_id: categoryId,
        parent_goal_id: null,
        project_id: projectId || null,
        group_id: null,
        label: isPersonal ? label.trim() : null,
        time_frame: timeFrame,
        target_value: targetNum,
        target_date: isDeadline ? targetDate : null,
        importance: Number(importance),
        tracking_method: byQuestion ? 'daily_question' : 'manual',
        tracked_by_question_id: questionId,
        measurement_type: isPersonal ? 'manual' : 'auto',
      })

      await ob.setAnswers('goals', {
        project_id: projectId || null,
        first_type: type,
        first_target: targetNum,
        time_frame: timeFrame,
        target_date: isDeadline ? targetDate : null,
        importance: Number(importance),
        personal_label: isPersonal ? label.trim() : null,
        tracking,
        question_text: byQuestion ? qText.trim() : null,
        question_scale: byQuestion ? qScale : null,
        question_icon: byQuestion ? qIcon : null,
        question_id: questionId,
        sched_mode: schedMode,
        sched_days: schedDays,
        sched_x: schedX,
        created_ids: [goal.id],
      })
      await ob.advance()
    } catch (e) {
      setErr(t('step6.errSaveFail', { error: e.message || t('step6.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  const chosenType = TYPES.find((ty) => ty.key === type)
  const projectName = projects.find((p) => p.id === projectId)?.name || ''
  const tfKey = TIME_FRAMES.find((f) => f.k === timeFrame)?.labelKey
  const tfLabel = tfKey ? t(tfKey) : ''
  const previewName = isPersonal ? (label.trim() || t('step6.personalLabel')) : (chosenType?.label || '')
  /* Category dot color for the preview card — auto types carry the preset
     color; personal goals use the same purple the personal category gets. */
  const catColor = isPersonal
    ? '#7a5cb8'
    : (CATEGORY_PRESETS.find((p) => p.key === type)?.color || 'var(--stone)')

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step6.intro')}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step6.introSub', { verb: t('step6.introSubVerb') })}</Txt>

      <Box className="ob-field">
        <Box as="label" className="ob-label" htmlFor="ob-g-proj">{t('step6.projectLabel')}</Box>
        <select
          id="ob-g-proj"
          className="ob-select"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">{t('step6.allProjects')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Box>

      {/* Compact type grid — was full-width cards (too tall for 6 options). */}
      <Box className="ob-field">
        <Txt as="p" className="ob-label">{t('step6.measureLabel')}</Txt>
        <Box className="ob-goal-grid">
          {TYPES.map((ty) => (
            <Btn
              key={ty.key}
              type="button"
              className={`ob-goal-type${type === ty.key ? ' on' : ''}`}
              onClick={() => setType(ty.key)}
              title={ty.hint}
            >
              <Txt className="ob-goal-type-ic">{ty.icon}</Txt>
              <Txt className="ob-goal-type-l">{ty.label}</Txt>
            </Btn>
          ))}
        </Box>
      </Box>

      {type && (
        <>
          {isPersonal && (
            <Box className="ob-field">
              <Box as="label" className="ob-label" htmlFor="ob-g-label">{t('step6.goalNameLabel')}</Box>
              <Input
                id="ob-g-label"
                className="ob-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('step6.goalNamePlaceholder')}
              />
            </Box>
          )}

          {/* Time frame first (like AddGoalModal: name → time frame → target). */}
          <Box className="ob-field">
            <Txt as="p" className="ob-label">{t('step6.timeFrameLabel')}</Txt>
            <Box className="ob-seg">
              {TIME_FRAMES.map((f) => (
                <Btn
                  key={f.k}
                  type="button"
                  className={`ob-seg-btn${timeFrame === f.k ? ' on' : ''}`}
                  onClick={() => setTimeFrame(f.k)}
                >
                  {t(f.labelKey)}
                </Btn>
              ))}
            </Box>
          </Box>

          {isDeadline && (
            <Box className="ob-field">
              <Box as="label" className="ob-label" htmlFor="ob-g-date">{t('step6.deadlineLabel')}</Box>
              <DateField
                className="ob-input"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </Box>
          )}

          <Box className="ob-field">
            <Box as="label" className="ob-label" htmlFor="ob-g-val">{t('step6.targetLabel')}</Box>
            <Input
              id="ob-g-val"
              className="ob-input"
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={type === 'income' ? t('step6.incomePlaceholder') : t('step6.genericPlaceholder')}
            />
            {targetHelp && <Txt as="p" className="ob-empty-hint">{targetHelp}</Txt>}
          </Box>

          {/* Importance — stars, matching AddGoalModal (was missing here). */}
          <Box className="ob-field">
            <Txt as="p" className="ob-label">{t('step6.importanceLabel')}</Txt>
            <Box className="ob-stars-pick" role="radiogroup" aria-label={t('step6.importanceAria')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Btn
                  key={n}
                  type="button"
                  className={`ob-star-btn${n <= importance ? ' on' : ''}`}
                  onClick={() => setImportance(n)}
                  aria-label={t('step6.starAria', { n })}
                  aria-checked={n === importance}
                  role="radio"
                >
                  <Star size={20} strokeWidth={1.5} fill={n <= importance ? 'currentColor' : 'none'} aria-hidden="true" />
                </Btn>
              ))}
            </Box>
            <Txt as="p" className="ob-empty-hint">{t('step6.importanceHint')}</Txt>
          </Box>

          {isPersonal && (
            <>
              <Box className="ob-field">
                <Txt as="p" className="ob-label">{t('step6.howMeasureLabel')}</Txt>
                <Box className="ob-seg">
                  {TRACKING.map((tr) => (
                    <Btn
                      key={tr.k}
                      type="button"
                      className={`ob-seg-btn${tracking === tr.k ? ' on' : ''}`}
                      onClick={() => setTracking(tr.k)}
                    >
                      {t(tr.labelKey)}
                    </Btn>
                  ))}
                </Box>
                <Txt as="p" className="ob-empty-hint">
                  {tracking === 'manual'
                    ? t('step6.manualHint')
                    : t('step6.questionHint')}
                </Txt>
              </Box>

              {byQuestion && (
                <>
                  <Box className="ob-field">
                    <Box as="label" className="ob-label" htmlFor="ob-g-q">{t('step6.questionLabel')}</Box>
                    <Input
                      id="ob-g-q"
                      className="ob-input"
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                      placeholder={qScale === 'yes_no' ? t('step6.questionPlaceholderYesNo') : t('step6.questionPlaceholderScale')}
                    />
                  </Box>
                  <Box className="ob-field">
                    <Txt as="p" className="ob-label">{t('step6.answerTypeLabel')}</Txt>
                    <Box className="ob-seg">
                      {SCALES.map((s) => (
                        <Btn
                          key={s.k}
                          type="button"
                          className={`ob-seg-btn${qScale === s.k ? ' on' : ''}`}
                          onClick={() => setQScale(s.k)}
                        >
                          {t(s.labelKey)}
                        </Btn>
                      ))}
                    </Box>
                  </Box>
                  <Box className="ob-field">
                    <Txt as="p" className="ob-label">{t('step6.iconLabel')}</Txt>
                    <Box className="ob-pills">
                      {QUESTION_ICONS.map((ic) => (
                        <Btn
                          key={ic}
                          type="button"
                          className={`ob-pill${qIcon === ic ? ' on' : ''}`}
                          onClick={() => setQIcon(ic)}
                          aria-label={t('step6.iconAria', { icon: ic })}
                        >
                          {ic}
                        </Btn>
                      ))}
                    </Box>
                  </Box>

                  {/* Pick which days the question is asked — for any
                      daily-question goal (slider or yes/no). For yes/no it
                      also caps the target; a warning shows if the target
                      can't be met by the chosen days. */}
                  <Box className="ob-field">
                    <Txt as="p" className="ob-label">{t('step6.whenAskLabel')}</Txt>
                    <ScheduleDayPicker
                      mode={schedMode}
                      days={schedDays}
                      x={schedX}
                      onChange={({ mode, days, x }) => { setSchedMode(mode); setSchedDays(days); setSchedX(x) }}
                    />
                    {scheduleWarning && (
                      <Txt as="p" className="ob-sched-warn">
                        <AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
                        {scheduleWarning}
                      </Txt>
                    )}
                  </Box>
                </>
              )}
            </>
          )}

          {/* Live goal preview — faithful to the in-app GoalCard: title +
              category dot + time frame, percent, progress bar, target line,
              and importance stars. Actual is 0 (nothing logged yet). */}
          {targetNum > 0 && (
            <Box className="ob-gcard">
              <Box className="ob-gcard-head">
                <Box className="ob-gcard-titleblock">
                  <Txt as="p" className="ob-gcard-title">{previewName}</Txt>
                  <Txt as="p" className="ob-gcard-cat">
                    <Txt className="ob-gcard-cat-dot" style={{ background: catColor }} />
                    {chosenType?.label} · {tfLabel}{isDeadline && targetDate ? ` (${targetDate})` : ''}
                    {projectName ? ` · ${projectName}` : ''}
                  </Txt>
                </Box>
                <Txt as="p" className="ob-gcard-pct">0%</Txt>
              </Box>
              <Box className="ob-gcard-progress">
                <Box className="ob-gcard-progress-fill" style={{ width: '0%' }} />
              </Box>
              <Box className="ob-gcard-meta">
                <Txt className="ob-gcard-target mono">0 / {targetNum.toLocaleString(numLocale)}</Txt>
                <Txt className="ob-gcard-stars" aria-label={`${t('step6.importanceLabel')} ${t('step6.starAria', { n: importance })}`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={12} strokeWidth={1.5} className={i <= importance ? 'on' : ''} fill={i <= importance ? 'currentColor' : 'none'} aria-hidden="true" />
                  ))}
                </Txt>
              </Box>
            </Box>
          )}
        </>
      )}

      {err && <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}
    </>
  )
}
