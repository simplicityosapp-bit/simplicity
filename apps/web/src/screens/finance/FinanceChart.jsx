import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowLeft } from 'lucide-react'
import { financeDailyBuckets, getMonthlyIncomeGoal, isr } from '@simplicity/core'
import { useGoals } from '../../hooks/useGoals'
import { useGoalCategories } from '../../hooks/useGoalCategories'
import { useTransactions } from '../../hooks/useTransactions'
import { ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'
import InfoPopover from '../../components/InfoPopover'
import {
  netChartGeometry, CHART_W_DEFAULT as W_DEFAULT, CHART_H as H, CHART_PAD_X as PAD_X,
} from './netChartGeometry'
import { Box, Txt, Btn } from '../../components/ui'

/* Moonlight chart — SVG line of cumulative NET (income − expenses) day by day
   for the selected month, with a soft area fill against the zero baseline, a
   "today" dot, and sparse x-axis labels (1, 7, 14, 21, last).
   - The line plots net so it ends on the same figure the card prints above it;
     it can fall as well as rise, and the fill is measured against zero.
   - The monthly income goal is marked on the Y axis for reference only — the
     exact tracking is the numeric chip in the header, which stays on income.
     With no goal set, a soft nudge invites the user to set one (→ /goals).
   - The chart shows the entire month — the today dot lands on the last day
     when viewing a past/future month.
   - The SVG coordinate width tracks the rendered container width (1:1 px),
     so the line/labels fill the card without the non-uniform horizontal
     stretch that previously smeared the axis numbers on wide (desktop)
     layouts.
   The geometry itself lives in ./netChartGeometry so it can be tested. */

export default function FinanceChart({ month }) {
  const { t } = useT('finance')
  const navigate = useNavigate()
  const { transactions } = useTransactions()
  const { goals } = useGoals()
  const { categories: goalCategories } = useGoalCategories()

  /* Measure the rendered chart width so the SVG viewBox maps 1 unit -> 1px.
     Keeping the coordinate space the same size as the painted box avoids the
     horizontal smear that preserveAspectRatio="none" caused on screens wider
     than the old fixed 320 viewBox. */
  const wrapRef = useRef(null)
  const [W, setW] = useState(W_DEFAULT)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const measure = () => {
      const next = Math.round(el.clientWidth)
      if (next > 0) setW(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const goal = useMemo(
    () => getMonthlyIncomeGoal(goals, goalCategories),
    [goals, goalCategories],
  )
  const targetValue = goal?.target_value || 0
  /* Resolve scope to primitives so useMemo deps stay stable across
     renders — passing a fresh object literal every render forces
     financeDailyBuckets to recompute on every parent re-render. */
  const goalProjectId = goal?.project_id || null
  const buckets = useMemo(
    () => financeDailyBuckets(
      month.getFullYear(),
      month.getMonth(),
      { projectId: goalProjectId, source: transactions },
    ),
    [month, goalProjectId, transactions],
  )

  const { daysInMonth, cumInc, cumNet } = buckets
  /* The LINE plots net (income − expenses), so it can fall as well as rise and
     the card's big "נטו החודש" number is the same figure the line ends on.
     The goal tracker stays on INCOME, because that is what the goal measures —
     see the header chip and the axis marker below. */
  const finalIncome = cumInc[cumInc.length - 1] || 0
  const pctOfGoal = targetValue > 0 ? Math.round((finalIncome / targetValue) * 100) : null

  /* Today index — only marked when viewing the current month; otherwise the
     dot sits at the last day. */
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth()
  const todayIdx = isCurrentMonth
    ? Math.min(today.getDate() - 1, daysInMonth - 1)
    : daysInMonth - 1

  const { path, area, zeroY, showZeroLine, goalY, goalClamped, todayX, todayY, stepX } = netChartGeometry({
    cumNet, daysInMonth, targetValue, todayIdx, width: W,
  })

  /* X-axis: sparse labels (1, 7, 14, 21, last day), de-duplicated. */
  const labelDays = [...new Set([1, 7, 14, 21, daysInMonth].filter((d) => d >= 1 && d <= daysInMonth))]

  return (
    <Box as="section" className="f-chart">
      <Box className="f-chart-head">
        <Txt as="p" className="f-chart-title">
          <Sparkles size={14} strokeWidth={1.6} aria-hidden="true" />
          {t('chart.title')}
          <InfoPopover
            label={t('chart.infoLabel')}
            text={t('chart.infoText')}
          />
        </Txt>
        {/* Goal progress stays NUMERIC and stays on income — the exact figure,
            unaffected by the net line beside it. The axis marker is only a
            visual reference, so this chip is what the user actually reads to
            know where they stand. */}
        {pctOfGoal != null && (
          <Txt className={`f-chart-pct${pctOfGoal >= 100 ? ' done' : ''}`}>
            <Txt className="f-chart-pct-lbl">{t('chart.incomeGoalLabel')}</Txt>
            {isr(finalIncome)} <Txt className="f-chart-pct-frac">/ {isr(targetValue)}</Txt>
          </Txt>
        )}
      </Box>

      <Box className="f-chart-svg-wrap" ref={wrapRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="f-chart-svg"
          style={{ display: 'block', width: '100%', height: `${H}px` }}
          aria-label={t('chart.svgAria')}
        >
          <defs>
            <linearGradient id="fChartArea" x1="0" y1="0" x2="0" y2="1">
              {/* Theme-aware stops: CSS sets stop-color so dark mode
                  can bump the fill alpha (clay glows almost invisibly
                  against the dark forest bg at 0.22). */}
              <stop offset="0%" className="f-chart-area-top" />
              <stop offset="100%" className="f-chart-area-bot" />
            </linearGradient>
          </defs>
          {/* Zero baseline — the line the net is measured against. Drawn only
              when the month dips below it, so a normal month isn't cluttered
              with a rule sitting on the bottom edge. */}
          {showZeroLine && (
            <line
              x1={PAD_X}
              y1={zeroY.toFixed(1)}
              x2={(W - PAD_X).toFixed(1)}
              y2={zeroY.toFixed(1)}
              className="f-chart-zero"
            />
          )}
          {/* The income goal as a marker on the Y axis rather than a rule
              across the plot: the line is net, so a full-width line would
              invite reading "net vs goal" — two different measures. A tick at
              the edge reads as a reference height, and the header chip carries
              the real number.
              When the goal sits outside the plotted range (the usual case — an
              income goal is normally well above the net) the marker is pinned
              to the edge and drawn as a caret, so it reads "the goal is beyond
              this view" rather than claiming a height it doesn't have. */}
          {goalY != null && (
            <g className={`f-chart-goal${goalClamped ? ' clamped' : ''}`} aria-hidden="true">
              {goalClamped ? (
                <path
                  d={`M${PAD_X - 3},${(goalY + 4).toFixed(1)} L${PAD_X + 1},${goalY.toFixed(1)} L${PAD_X + 5},${(goalY + 4).toFixed(1)}`}
                  className="f-chart-goal-caret"
                />
              ) : (
                <>
                  <line
                    x1={PAD_X}
                    y1={goalY.toFixed(1)}
                    x2={(PAD_X + 14).toFixed(1)}
                    y2={goalY.toFixed(1)}
                    className="f-chart-goal-tick"
                  />
                  <circle cx={PAD_X.toFixed(1)} cy={goalY.toFixed(1)} r="2.6" className="f-chart-goal-dot" />
                </>
              )}
            </g>
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
      </Box>

      {targetValue === 0 && (
        <Btn
          type="button"
          className="f-chart-cta"
          onClick={() => navigate(ROUTES.GOALS)}
        >
          {t('chart.setGoal')} <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        </Btn>
      )}
    </Box>
  )
}
