/* ════════════════════════════════════════════════════════════════
   NET CHART GEOMETRY — pure, no DOM, no React.
   ════════════════════════════════════════════════════════════════
   Given the month's cumulative net series, returns everything the SVG
   in FinanceChart needs: the line path, the area path, where zero sits
   on the canvas, and where the income-goal marker goes.

   It lives in its own module rather than inside the component because a
   NET series can cross zero, and the two things that go wrong when it
   does — an area that fills to the bottom of the box instead of to the
   baseline (painting a loss so it reads like a gain), and a baseline
   that isn't on the canvas at all — are invisible in code review and
   obvious in a test.
   ════════════════════════════════════════════════════════════════ */

export const CHART_W_DEFAULT = 320
export const CHART_H = 132
export const CHART_PAD_X = 12
export const CHART_PAD_TOP = 14
export const CHART_PAD_BOTTOM = 22

export function netChartGeometry({
  cumNet,
  daysInMonth,
  targetValue = 0,
  todayIdx = 0,
  width = CHART_W_DEFAULT,
}) {
  /* Scale to the NET SERIES and zero — deliberately NOT to the goal.
     The goal is an income figure and is routinely several times the net, so
     letting it stretch the axis flattens the line into an unreadable band
     exactly when the month is worth looking at (a ₪9,000 goal against a
     −₪1,800 net gave the line about a fifth of the height). Zero stays in
     because the baseline has to be drawable and a dip below it must read as
     below it. The goal marker is clamped into view instead — see goalClamped. */
  const allValues = [...cumNet, 0]
  let mx = Math.max(...allValues)
  const mn = Math.min(...allValues, 0)
  if (mx === mn) mx = mn + 1
  mx += (mx - mn) * 0.08
  const stepX = (width - CHART_PAD_X * 2) / Math.max(1, daysInMonth - 1)
  const yScale = (v) =>
    CHART_PAD_TOP + (1 - (v - mn) / (mx - mn || 1)) * (CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM)

  let path = ''
  cumNet.forEach((v, i) => {
    path += (path === '' ? 'M' : ' L') + (CHART_PAD_X + i * stepX).toFixed(1) + ',' + yScale(v).toFixed(1)
  })

  /* The fill runs to the ZERO baseline, not to the bottom of the box. */
  const zeroY = yScale(0)
  let area = ''
  if (path) {
    const lastX = CHART_PAD_X + (cumNet.length - 1) * stepX
    area = path + ` L${lastX.toFixed(1)},${zeroY.toFixed(1)} L${CHART_PAD_X.toFixed(1)},${zeroY.toFixed(1)} Z`
  }

  /* The goal marker rides the same axis but never stretches it. When it falls
     outside the plotted range it is pinned to the edge and flagged, so the
     view can show that the goal is beyond what is drawn rather than lying
     about its height. */
  let goalY = null
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
    /* Only worth drawing when the month actually goes negative — otherwise the
       baseline duplicates the bottom edge of the plot. */
    showZeroLine: mn < 0,
    goalY,
    goalClamped,
    todayX: CHART_PAD_X + todayIdx * stepX,
    todayY: yScale(cumNet[todayIdx] || 0),
    stepX,
    yScale,
  }
}
