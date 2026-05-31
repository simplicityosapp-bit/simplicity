import { useEffect, useState } from 'react'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useProjects } from '../../../hooks/useProjects'
import { useUserQuestions } from '../../../hooks/useUserQuestions'
import { CATEGORY_PRESETS, presetToCategory } from '../../../lib/goalPresets'

/* Step 6 — first goal, faithful to the in-app AddGoalModal:
   - every auto category the app supports (derived from CATEGORY_PRESETS,
     so new presets show up here automatically) + a personal track
   - time frame is monthly / weekly / "until a date" (deadline) for ALL
     goals, exactly like in-app — with a date field when deadline
   - a live goal card previews what's being created
   Personal goals add name + tracking method (manual / daily question). */

/* Auto categories come straight from the canonical preset catalog so the
   onboarding can never fall behind the app. Personal is appended. */
const AUTO_TYPES = CATEGORY_PRESETS.map((p) => ({ key: p.key, label: p.name, icon: p.icon, hint: p.hint, auto: true }))
const TYPES = [...AUTO_TYPES, { key: 'personal', label: 'יעד אישי', icon: '✍️', hint: 'למידה, יצירה, ריצה — מה שאת/ה מודד/ת', auto: false }]

const TIME_FRAMES = [
  { k: 'monthly',  l: 'חודשי' },
  { k: 'weekly',   l: 'שבועי' },
  { k: 'deadline', l: 'עד תאריך' },
]
const TRACKING = [
  { k: 'manual',         l: 'הזנה ידנית' },
  { k: 'daily_question', l: 'שאלה יומית' },
]
const SCALES = [
  { k: '1-10',  l: 'סולם 1–10' },
  { k: 'yes_no', l: 'כן / לא' },
]
const QUESTION_ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

export default function Step6Goals({ ob, setCTA }) {
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
  /* Personal-goal extras (collapsed when an auto type is picked). */
  const [label, setLabel]           = useState(initial.personal_label || '')
  const [tracking, setTracking]     = useState(initial.tracking || 'manual')
  /* Daily-question extras (collapsed unless tracking = daily_question). */
  const [qText, setQText]   = useState(initial.question_text || '')
  const [qScale, setQScale] = useState(initial.question_scale || '1-10')
  const [qIcon, setQIcon]   = useState(initial.question_icon || QUESTION_ICONS[0])

  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const isPersonal   = type === 'personal'
  const byQuestion   = isPersonal && tracking === 'daily_question'
  const isDeadline   = timeFrame === 'deadline'
  const targetNum    = Number(target)
  const canAdvance   = !!type && targetNum > 0
    && (!isDeadline || !!targetDate)
    && (!isPersonal || label.trim().length > 0)
    && (!byQuestion || qText.trim().length > 0)
  const hint = !type ? 'בחר/י סוג יעד.'
    : targetNum <= 0 ? 'הזן/י ערך חיובי.'
    : (isDeadline && !targetDate) ? 'בחר/י תאריך יעד.'
    : (isPersonal && !label.trim()) ? 'תן/י שם ליעד.'
    : (byQuestion && !qText.trim()) ? 'נסח/י את השאלה היומית.'
    : null
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) },
    [type, target, timeFrame, targetDate, label, tracking, qText, qScale, qIcon, projectId, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

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
          icon: qIcon, active: true, schedule_pattern: {},
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
        importance: 3,
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
        personal_label: isPersonal ? label.trim() : null,
        tracking,
        question_text: byQuestion ? qText.trim() : null,
        question_scale: byQuestion ? qScale : null,
        question_icon: byQuestion ? qIcon : null,
        question_id: questionId,
        created_ids: [goal.id],
      })
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    } finally {
      setBusy(false)
    }
  }

  const chosenType = TYPES.find((t) => t.key === type)
  const projectName = projects.find((p) => p.id === projectId)?.name || ''
  const tfLabel = TIME_FRAMES.find((f) => f.k === timeFrame)?.l || ''
  const previewName = isPersonal ? (label.trim() || 'יעד אישי') : (chosenType?.label || '')

  return (
    <>
      <p className="ob-intro">נגדיר יעד ראשון?</p>
      <p className="ob-intro-sub">תוכל לעקוב אחר ההתקדמות שלך בקלות — וכמובן לערוך את היעד מתי שתרצה.</p>

      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-g-proj">לאיזה פרויקט?</label>
        <select
          id="ob-g-proj"
          className="ob-select"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">כל הפרויקטים</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Compact type grid — was full-width cards (too tall for 6 options). */}
      <div className="ob-field">
        <p className="ob-label">מה נמדוד?</p>
        <div className="ob-goal-grid">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`ob-goal-type${type === t.key ? ' on' : ''}`}
              onClick={() => setType(t.key)}
              title={t.hint}
            >
              <span className="ob-goal-type-ic">{t.icon}</span>
              <span className="ob-goal-type-l">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {type && (
        <>
          {isPersonal && (
            <div className="ob-field">
              <label className="ob-label" htmlFor="ob-g-label">שם היעד</label>
              <input
                id="ob-g-label"
                className="ob-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="לדוגמה: 5 שעות למידה בשבוע"
              />
            </div>
          )}

          <div className="ob-field">
            <label className="ob-label" htmlFor="ob-g-val">יעד</label>
            <input
              id="ob-g-val"
              className="ob-input"
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={type === 'income' ? '15,000' : '5'}
            />
          </div>

          {/* Time frame — for EVERY goal, matching the in-app modal. */}
          <div className="ob-field">
            <p className="ob-label">מסגרת זמן</p>
            <div className="ob-seg">
              {TIME_FRAMES.map((f) => (
                <button
                  key={f.k}
                  type="button"
                  className={`ob-seg-btn${timeFrame === f.k ? ' on' : ''}`}
                  onClick={() => setTimeFrame(f.k)}
                >
                  {f.l}
                </button>
              ))}
            </div>
          </div>

          {isDeadline && (
            <div className="ob-field">
              <label className="ob-label" htmlFor="ob-g-date">תאריך יעד</label>
              <input
                id="ob-g-date"
                className="ob-input"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          )}

          {isPersonal && (
            <>
              <div className="ob-field">
                <p className="ob-label">איך נמדוד?</p>
                <div className="ob-seg">
                  {TRACKING.map((t) => (
                    <button
                      key={t.k}
                      type="button"
                      className={`ob-seg-btn${tracking === t.k ? ' on' : ''}`}
                      onClick={() => setTracking(t.k)}
                    >
                      {t.l}
                    </button>
                  ))}
                </div>
                <p className="ob-empty-hint">
                  {tracking === 'manual'
                    ? 'תזין/י התקדמות ידנית מהמסך הראשי.'
                    : 'ניצור שאלה יומית — סליידר או כן/לא — שמתחברת ליעד.'}
                </p>
              </div>

              {byQuestion && (
                <>
                  <div className="ob-field">
                    <label className="ob-label" htmlFor="ob-g-q">השאלה היומית</label>
                    <input
                      id="ob-g-q"
                      className="ob-input"
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                      placeholder={qScale === 'yes_no' ? 'לדוגמה: למדת היום?' : 'לדוגמה: כמה זמן למדת היום?'}
                    />
                  </div>
                  <div className="ob-field">
                    <p className="ob-label">סוג תשובה</p>
                    <div className="ob-seg">
                      {SCALES.map((s) => (
                        <button
                          key={s.k}
                          type="button"
                          className={`ob-seg-btn${qScale === s.k ? ' on' : ''}`}
                          onClick={() => setQScale(s.k)}
                        >
                          {s.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ob-field">
                    <p className="ob-label">אייקון</p>
                    <div className="ob-pills">
                      {QUESTION_ICONS.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          className={`ob-pill${qIcon === ic ? ' on' : ''}`}
                          onClick={() => setQIcon(ic)}
                          aria-label={`אייקון ${ic}`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Live goal preview card — faithful to a goal as it'll appear. */}
          {targetNum > 0 && (
            <div className="ob-goal-card">
              <div className="ob-gc-head">
                <span className="ob-gc-ic">{chosenType?.icon}</span>
                <p className="ob-gc-name">{previewName}</p>
              </div>
              <p className="ob-gc-meta">
                יעד {targetNum.toLocaleString('he-IL')} · {tfLabel}{isDeadline && targetDate ? ` (${targetDate})` : ''}
                {projectName ? ` · ${projectName}` : ''}
              </p>
              {!isPersonal && chosenType && <p className="ob-gc-hint">{chosenType.hint}</p>}
            </div>
          )}
        </>
      )}

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}
    </>
  )
}
