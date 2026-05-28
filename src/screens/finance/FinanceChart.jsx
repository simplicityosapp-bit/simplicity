import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { financeDailyBuckets, getMonthlyIncomeGoal, isr } from '../../lib/finance'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useTransactions } from '../../hooks/useTransactions'
import { ROUTES } from '../../lib/routes'
import InfoPopover from '../../components/InfoPopover'

/* Moonlight chart — SVG line of cumulative income day by day for the selected
   month, with a dashed goal target line, a soft area fill, a "today" dot,
   and sparse x-axis labels (1, 7, 14, 21, last). Ports the prototype's
   renderFinanceChart() to React.
   - When no monthly income goal is defined, the dashed line is hidden and a
     soft nudge invites the user to set one (taps through to /goals).
   - The chart shows the entire month — the today dot lands on the last day
     when viewing a past/future month. */
const W = 320
const H = 132
const PAD_X = 12
const PAD_TOP = 14
const PAD_BOTTOM = 22

export default function FinanceChart({ month }) {
  const navigate = useNavigate()
  const { transactions } = useTransactions()
  const { goals } = useGoals()
  const { categories: goalCategories } = useGoalCategories()

  const goal = useMemo(
    () => getMonthlyIncomeGoal(goals, goalCategories),
    [goals, goalCategories],
  )
  const targetValue = goal?.target_value || 0
  const scopeOpts = goal
    ? { projectId: goal.project_id || null, source: transactions }
    : { source: transactions }

  const buckets = useMemo(
    () => financeDailyBuckets(month.getFullYear(), month.getMonth(), scopeOpts),
    [month, scopeOpts],
  )

  const { daysInMonth, cumInc } = buckets
  const finalIncome = cumInc[cumInc.length - 1] || 0
  const pctOfGoal = targetValue > 0 ? Math.round((finalIncome / targetValue) * 100) : null

  /* Today index — only marked when viewing the current month; otherwise the
     dot sits at the last day. */
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
  const todayIdx = isCurrentMonth
    ? Math.min(today.getDate() - 1, daysInMonth - 1)
    : daysInMonth - 1

  /* Scale: include 0 + target so the dashed line is always on-canvas. */
  const allValues = [...cumInc, 0]
  if (targetValue > 0) allValues.push(targetValue)
  let mx = Math.max(...allValues)
  const mn = Math.min(...allValues, 0)
  if (mx === mn) mx = mn + 1
  const range = mx - mn
  mx += range * 0.08
  const stepX = (W - PAD_X * 2) / Math.max(1, daysInMonth - 1)
  const yScale = (v) => PAD_TOP + (1 - (v - mn) / (mx - mn || 1)) * (H - PAD_TOP - PAD_BOTTOM)

  let path = ''
  cumInc.forEach((v, i) => {
    const x = PAD_X + i * stepX
    const y = yScale(v)
    path += (path === '' ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1)
  })
  let area = ''
  if (path) {
    const lastX = PAD_X + (cumInc.length - 1) * stepX
    const baseY = H - PAD_BOTTOM
    area = path + ` L${lastX.toFixed(1)},${baseY.toFixed(1)} L${PAD_X.toFixed(1)},${baseY.toFixed(1)} Z`
  }

  const todayX = PAD_X + todayIdx * stepX
  const todayY = yScale(cumInc[todayIdx] || 0)

  /* X-axis: sparse labels (1, 7, 14, 21, last day), de-duplicated. */
  const labelDays = [...new Set([1, 7, 14, 21, daysInMonth].filter((d) => d >= 1 && d <= daysInMonth))]

  return (
    <section className="f-chart">
      <div className="f-chart-head">
        <p className="f-chart-title">
          <Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
          הכנסה מצטברת
          <InfoPopover
            label="הסבר גרף הכנסה מצטברת"
            text="הגרף מצטבר יום אחר יום את ההכנסות (מאושרות) של החודש הנבחר. הקו המקווקו הוא יעד ההכנסה החודשי שהוגדר במסך 'מטרות' — אם אין יעד, הוא לא מוצג. הנקודה היא היום הנוכחי."
          />
        </p>
        {pctOfGoal != null && (
          <span className={`f-chart-pct${pctOfGoal >= 100 ? ' done' : ''}`}>
            {isr(finalIncome)} <span className="f-chart-pct-frac">/ {isr(targetValue)}</span>
          </span>
        )}
      </div>

      <div className="f-chart-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="f-chart-svg"
          style={{ display: 'block', width: '100%', height: `${H}px` }}
          aria-label="גרף הכנסה מצטברת לפי ימי החודש"
        >
          <defs>
            <linearGradient id="fChartArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(201,123,94,.22)" />
              <stop offset="100%" stopColor="rgba(201,123,94,0)" />
            </linearGradient>
          </defs>
          {targetValue > 0 && (
            <line
              x1={PAD_X}
              y1={yScale(targetValue).toFixed(1)}
              x2={(W - PAD_X).toFixed(1)}
              y2={yScale(targetValue).toFixed(1)}
              className="f-chart-target"
            />
          )}
          {area && <path d={area} fill="url(#fChartArea)" />}
          {path && <path d={path} className="f-chart-line" />}
          {path && (
            <circle cx={todayX.toFixed(1)} cy={todayY.toFixed(1)} r="4.5" className="f-chart-dot" />
          )}
          {labelDays.map((d) => {
            const x = PAD_X + (d - 1) * stepX
            return (
              <text
                key={d}
                x={x.toFixed(1)}
                y={(H - 6).toFixed(1)}
                textAnchor="middle"
                className="f-chart-axis"
              >
                {d}
              </text>
            )
          })}
        </svg>
      </div>

      {targetValue === 0 && (
        <button
          type="button"
          className="f-chart-cta"
          onClick={() => navigate(ROUTES.GOALS)}
        >
          הגדר/י יעד הכנסה חודשי ←
        </button>
      )}
    </section>
  )
}
