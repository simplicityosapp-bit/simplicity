import { useState } from 'react'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { CATEGORY_PRESETS, presetToCategory } from '../../../lib/goalPresets'

/* Step 6 — first goal + optional income goal.
   We surface the 4 preset goal categories (income / clients / leads /
   closings). The user picks one as the "first goal" — we create the
   matching goal category lazily if it doesn't exist, then a goal row.
   Then an optional second card: monthly income goal. Both are
   skippable but a value of `null` per field is preserved so the user
   can pick up later from settings → goals. */

const FIRST_GOAL_LABELS = {
  clients_active:  { l: 'לקוחות פעילים',     unit: 'לקוחות' },
  leads_inquiries: { l: 'פניות חדשות',        unit: 'פניות' },
  leads_closings:  { l: 'סגירות',             unit: 'סגירות' },
  income:          { l: 'יצירה / הכנסות',     unit: '₪' },
}

export default function Step6Goals({ ob }) {
  const { addGoal } = useGoals()
  const { categories, addCategory } = useGoalCategories()
  const initial = ob.state.answers?.goals || {}
  const [firstType, setFirstType] = useState(initial.first_type || null)
  const [firstTarget, setFirstTarget] = useState(initial.first_target || '')
  const [incomeOpen, setIncomeOpen] = useState(!!initial.income_goal_amount)
  const [incomeAmount, setIncomeAmount] = useState(initial.income_goal_amount || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canAdvance = firstType && Number(firstTarget) > 0

  /* Find-or-create the goal category for a preset key. Reuses the
     existing presetToCategory shape so the UI stays consistent. */
  const resolveCategoryId = async (presetKey) => {
    const existing = categories.find((c) => c.key === presetKey)
    if (existing) return existing.id
    const preset = CATEGORY_PRESETS.find((p) => p.key === presetKey)
    if (!preset) throw new Error('preset not found')
    const created = await addCategory(presetToCategory(preset))
    return created.id
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const createdIds = []
      const firstCatId = await resolveCategoryId(firstType)
      const firstGoal = await addGoal({
        category_id: firstCatId,
        parent_goal_id: null,
        project_id: null,
        group_id: null,
        label: FIRST_GOAL_LABELS[firstType]?.l || null,
        time_frame: 'monthly',
        target_value: Number(firstTarget),
        target_date: null,
        importance: 3,
        tracking_method: 'manual',
        tracked_by_question_id: null,
        measurement_type: 'auto',
      })
      createdIds.push(firstGoal.id)

      let incomeGoalId = null
      if (incomeOpen && Number(incomeAmount) > 0 && firstType !== 'income') {
        const incomeCatId = await resolveCategoryId('income')
        const incomeGoal = await addGoal({
          category_id: incomeCatId,
          parent_goal_id: null,
          project_id: null,
          group_id: null,
          label: null,
          time_frame: 'monthly',
          target_value: Number(incomeAmount),
          target_date: null,
          importance: 3,
          tracking_method: 'manual',
          tracked_by_question_id: null,
          measurement_type: 'auto',
        })
        createdIds.push(incomeGoal.id)
        incomeGoalId = incomeGoal.id
      }

      await ob.setAnswers('goals', {
        first_type: firstType,
        first_target: Number(firstTarget),
        income_goal_amount: incomeOpen ? Number(incomeAmount) || null : null,
        created_ids: createdIds,
        income_goal_id: incomeGoalId,
      })
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    } finally {
      setBusy(false)
    }
  }

  const showIncomeRow = firstType !== 'income'
  const unit = FIRST_GOAL_LABELS[firstType]?.unit || ''

  return (
    <>
      <p className="ob-intro">מה תרצה/י לראות גדל החודש?</p>
      <p className="ob-intro-sub">יעדים מחברים את הכל יחד — הם משמשים גם ב"מבט על" ובדוחות.</p>

      <div className="ob-field">
        <p className="ob-label">סוג היעד הראשון</p>
        <div className="ob-card-options">
          {Object.entries(FIRST_GOAL_LABELS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              className={`ob-option-card${firstType === k ? ' on' : ''}`}
              onClick={() => setFirstType(k)}
            >
              <span className="ob-option-card-l">{v.l}</span>
            </button>
          ))}
        </div>
      </div>

      {firstType && (
        <div className="ob-field">
          <label className="ob-label" htmlFor="ob-goal-val">ערך חודשי</label>
          <input
            id="ob-goal-val"
            className="ob-input"
            type="number"
            min="0"
            value={firstTarget}
            onChange={(e) => setFirstTarget(e.target.value)}
            placeholder={firstType === 'income' ? '15,000' : '3'}
          />
          <p className="ob-empty-hint">יחידות: {unit}</p>
        </div>
      )}

      {showIncomeRow && (
        <div className="ob-field">
          <p className="ob-label">רוצה להגדיר גם יעד הכנסה חודשי?</p>
          <div className="ob-card-options">
            <button
              type="button"
              className={`ob-option-card${!incomeOpen ? ' on' : ''}`}
              onClick={() => { setIncomeOpen(false); setIncomeAmount('') }}
            >
              <span className="ob-option-card-l">לא עכשיו</span>
            </button>
            <button
              type="button"
              className={`ob-option-card${incomeOpen ? ' on' : ''}`}
              onClick={() => setIncomeOpen(true)}
            >
              <span className="ob-option-card-l">כן, בוא נגדיר</span>
            </button>
          </div>
          {incomeOpen && (
            <input
              className="ob-input"
              type="number"
              min="0"
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
              placeholder="יעד הכנסה חודשי ב-₪"
              style={{ marginTop: 6 }}
            />
          )}
        </div>
      )}

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="ob-btn primary"
          onClick={onNext}
          disabled={!canAdvance || busy}
        >
          {busy ? 'שומר…' : 'הלאה'}
        </button>
      </div>
    </>
  )
}
