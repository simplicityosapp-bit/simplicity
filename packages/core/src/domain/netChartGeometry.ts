/* ════════════════════════════════════════════════════════════════
   NET CHART GEOMETRY — pure, shared by both apps.
   ════════════════════════════════════════════════════════════════
   Moved from apps/web/src/screens/finance/netChartGeometry.js. Given the
   month's cumulative net series, returns everything the chart needs: the
   line path, the area path, where zero sits, and where the income-goal
   marker goes. The phone plotted cumulative INCOME, filled to the bottom
   of the box and had no goal; it now draws from this.

   A NET series can cross zero, and the two things that go wrong when it
   does — an area filled to the bottom of the box instead of the baseline
   (painting a loss so it reads like a gain), and a baseline not on the
   canvas at all — are invisible in review and obvious in a test.
   ════════════════════════════════════════════════════════════════ */

export const CHART_W_DEFAULT = 320
export const CHART_H = 132
export const CHART_PAD_X = 12
export const CHART_PAD_TOP = 14
export const CHART_PAD_BOTTOM = 22

export interface NetChartInput {
  cumNet: number[]
  daysInMonth: number
  targetValue?: number
  todayIdx?: number
  width?: number
}

export function netChartGeometry({ cumNet, daysInMonth, targetValue = 0, todayIdx = 0, width = CHART_W_DEFAULT }: NetChartInput) {
  /* Scale to the NET SERIES and zero — deliberately NOT to the goal, which is
     an income figure routinely several times the net; letting it stretch the
     axis flattens the line. The goal marker is clamped into view instead. */
  const allValues = [...cumNet, 0]
  let mx = Math.max(...allValues)
  const mn = Math.min(...allValues, 0)
  if (mx === mn) mx = mn + 1
  mx += (mx - mn) * 0.08
  const stepX = (width - CHART_PAD_X * 2) / Math.max(1, daysInMonth - 1)
  const yScale = (v: number) =>
    CHART_PAD_TOP + (1 - (v - mn) / (mx - mn || 1)) * (CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM)

  let path = ''
  cumNet.forEach((v, i) => {
    path += (path === '' ? 'M' : ' L') + (CHART_PAD_X + i * stepX).toFixed(1) + ',' + yScale(v).toFixed(1)
  })

  // The fill runs to the ZERO baseline, not to the bottom of the box.
  const zeroY = yScale(0)
  let area = ''
  if (path) {
    const lastX = CHART_PAD_X + (cumNet.length - 1) * stepX
    area = path + ` L${lastX.toFixed(1)},${zeroY.toFixed(1)} L${CHART_PAD_X.toFixed(1)},${zeroY.toFixed(1)} Z`
  }

  /* The goal marker rides the same axis but never stretches it. Outside the
     plotted range it is pinned to the edge and flagged, so the view can show
     "beyond this view" rather than lying about its height. */
  let goalY: number | null = null
  let goalClamped = false
  if (targetValue > 0) {
    const raw = yScale(targetValue)
    goalY = Math.min(Math.max(raw, CHART_PAD_TOP), CHART_H - CHART_PAD_BOTTOM)
    goalClamped = Math.abs(raw - goalY) > 0.5
  }

  return {
    path,
    area,
    zeroY,
    // Only worth drawing when the month actually goes negative.
    showZeroLine: mn < 0,
    goalY,
    goalClamped,
    todayX: CHART_PAD_X + todayIdx * stepX,
    todayY: yScale(cumNet[todayIdx] || 0),
    stepX,
    yScale,
  }
}
