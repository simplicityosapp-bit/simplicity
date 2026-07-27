import { useState } from 'react'
import { Star } from 'lucide-react'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { CATEGORY_PRESETS, presetToCategory, resolveManualCategoryId, MANUAL_CATEGORY } from '../../../lib/goalPresets'
import { useT } from '../../../i18n/useT'
import { useStepCTA } from '../useStepCTA'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* ════════════════════════════════════════════════════════════════
   Step 4 — the first goal.
   ════════════════════════════════════════════════════════════════
   This was the heaviest screen in the app: a project select, six metric
   tiles, three time frames, a date field, a target, five importance
   stars, two tracking methods, a question to phrase, two answer scales,
   ten icons, a day-of-week schedule picker, and a warning for when the
   target exceeded the days chosen. Thirty-odd controls, three levels
   deep, on step six of nine — for a user who had never seen a goal.

   Pick what matters and put a number on it. Monthly, importance 3,
   updated by hand: the defaults every one of those controls already
   carried. The goals screen keeps the full range, daily-question
   tracking included, for when a goal is worth that much setup.
   ════════════════════════════════════════════════════════════════ */

const DEFAULT_TIME_FRAME = 'monthly'
const DEFAULT_IMPORTANCE = 3

export default function Step4Goals({ ob, setCTA }) {
  const { t, lang } = useT('onboardingSteps')
  /* Number grouping follows the active UI language (matches lib/goals
     formatGoal), so a Spanish user doesn't see Hebrew-locale formatting. */
  const numLocale = lang === 'he' ? 'he-IL' : (lang || 'he-IL')
  const { addGoal, updateGoal } = useGoals()
  const { categories, addCategory } = useGoalCategories()

  /* Auto metrics come from the canonical preset catalog, so a new preset
     appears here without touching this file. The manual track is appended,
     sharing the app-wide bucket. */
  const TYPES = [
    ...CATEGORY_PRESETS.map((p) => ({ key: p.key, label: p.name, icon: p.icon, hint: p.hint })),
    { key: 'personal', label: t('step4.personalLabel'), icon: MANUAL_CATEGORY.icon, hint: t('step4.personalHint') },
  ]

  const initial = ob.state.answers?.goals || {}
  const [type, setType]     = useState(initial.first_type || null)
  const [target, setTarget] = useState(initial.first_target || '')
  const [label, setLabel]   = useState(initial.personal_label || '')
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState('')

  const isPersonal = type === 'personal'
  const targetNum = Number(target)

  const canAdvance = !!type && targetNum > 0 && (!isPersonal || label.trim().length > 0)
  const hint = !type ? t('step4.hintPickType')
    : targetNum <= 0 ? t('step4.hintPositive')
    : (isPersonal && !label.trim()) ? t('step4.hintNameGoal')
    : null

  /* Auto types find-or-create their preset category; a personal goal goes
     into the app-wide manual bucket shared with the goals screen. */
  const resolveCategoryId = async () => {
    if (isPersonal) return resolveManualCategoryId(categories, addCategory)
    const existing = categories.find((c) => c.key === type)
    if (existing) return existing.id
    const preset = CATEGORY_PRESETS.find((p) => p.key === type)
    if (!preset) throw new Error('preset not found')
    return (await addCategory(presetToCategory(preset))).id
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const categoryId = await resolveCategoryId()
      const payload = {
        category_id: categoryId,
        parent_goal_id: null,
        project_id: null,          /* all projects — the useful default with one */
        group_id: null,
        label: isPersonal ? label.trim() : null,
        time_frame: DEFAULT_TIME_FRAME,
        target_value: targetNum,
        target_date: null,
        importance: DEFAULT_IMPORTANCE,
        tracking_method: 'manual',
        tracked_by_question_id: null,
        measurement_type: isPersonal ? 'manual' : 'auto',
      }
      /* A goal this step created on an earlier pass is UPDATED, never
         skipped (which dropped edits) or recreated (which orphaned the
         first row). Gone from under us → create a fresh one. */
      const prevId = initial.created_ids?.[0] || null
      let goal = null
      if (prevId) goal = await updateGoal(prevId, payload).catch(() => null)
      if (!goal) goal = await addGoal(payload)

      await ob.setAnswers('goals', {
        first_type: type,
        first_target: targetNum,
        personal_label: isPersonal ? label.trim() : null,
        created_ids: [goal.id],
      })
      await ob.advance()
    } catch (e) {
      setErr(t('step4.errSaveFail', { error: e.message || t('step4.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useStepCTA(setCTA, { onNext, canAdvance, busy, hint })

  const chosen = TYPES.find((ty) => ty.key === type)
  const previewName = isPersonal ? (label.trim() || t('step4.personalLabel')) : (chosen?.label || '')
  const catColor = isPersonal
    ? MANUAL_CATEGORY.color
    : (CATEGORY_PRESETS.find((p) => p.key === type)?.color || 'var(--stone)')

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step4.intro')}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step4.introSub')}</Txt>

      <Box className="ob-field">
        <Box className="ob-goal-grid">
          {TYPES.map((ty) => (
            <Btn
              key={ty.key}
              type="button"
              className={`ob-goal-type${type === ty.key ? ' on' : ''}`}
              aria-pressed={type === ty.key}
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
              <Box as="label" className="ob-label" htmlFor="ob-g-label">{t('step4.goalNameLabel')}</Box>
              <Input
                id="ob-g-label"
                className="ob-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('step4.goalNamePlaceholder')}
              />
            </Box>
          )}

          <Box className="ob-field">
            <Box as="label" className="ob-label" htmlFor="ob-g-val">{t('step4.targetLabel')}</Box>
            <Input
              id="ob-g-val"
              className="ob-input"
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={type === 'income' ? t('step4.incomePlaceholder') : t('step4.genericPlaceholder')}
            />
            <Txt as="p" className="ob-empty-hint">{t('step4.targetHelp')}</Txt>
          </Box>

          {/* Live preview — the same shape as the in-app GoalCard, so the
              board is already familiar. Actual is 0; nothing logged yet. */}
          {targetNum > 0 && (
            <Box className="ob-gcard">
              <Box className="ob-gcard-head">
                <Box className="ob-gcard-titleblock">
                  <Txt as="p" className="ob-gcard-title">{previewName}</Txt>
                  <Txt as="p" className="ob-gcard-cat">
                    <Txt className="ob-gcard-cat-dot" style={{ background: catColor }} />
                    {chosen?.label} · {t('step4.monthly')}
                  </Txt>
                </Box>
                <Txt as="p" className="ob-gcard-pct">0%</Txt>
              </Box>
              <Box className="ob-gcard-progress">
                <Box className="ob-gcard-progress-fill" style={{ width: '0%' }} />
              </Box>
              <Box className="ob-gcard-meta">
                <Txt className="ob-gcard-target mono">0 / {targetNum.toLocaleString(numLocale)}</Txt>
                <Txt className="ob-gcard-stars" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} size={12} strokeWidth={1.5} className={i <= DEFAULT_IMPORTANCE ? 'on' : ''} fill={i <= DEFAULT_IMPORTANCE ? 'currentColor' : 'none'} />
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
