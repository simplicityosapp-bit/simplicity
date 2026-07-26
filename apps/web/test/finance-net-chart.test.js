/* ════════════════════════════════════════════════════════════════
   NET CHART GEOMETRY — the line can now go down.
   ════════════════════════════════════════════════════════════════
   The finance chart used to plot cumulative INCOME, which only ever rises
   from zero. It now plots cumulative NET, which can cross zero in either
   direction — and the two things that break when it does are invisible in
   code review:

     · the area filling to the bottom of the box instead of to the zero
       baseline, so a month deep in the red is painted as a big solid mass
       that reads exactly like a good month;
     · zero falling outside the scale entirely, so a line that is below
       break-even is drawn as though it were above it.

   These pin both, plus the income-goal marker that shares the axis.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import {
  netChartGeometry, CHART_H, CHART_PAD_X, CHART_PAD_TOP, CHART_PAD_BOTTOM,
} from '../src/screens/finance/netChartGeometry'

const PLOT_TOP = CHART_PAD_TOP
const PLOT_BOTTOM = CHART_H - CHART_PAD_BOTTOM

/* Pull the coordinates out of a path string. The area path ends in a "Z", so
   commands are stripped rather than just used as separators. */
const points = (path) =>
  path.replace(/[MLZ]/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map((p) => p.split(',').map(Number))
const ys = (path) => points(path).map(([, y]) => y)
const xs = (path) => points(path).map(([x]) => x)

/* A month that climbs steadily. */
const rising = [100, 200, 300, 400, 500]
/* A month that starts well and ends underwater — the case the old chart
   could not express at all. */
const crossing = [300, 100, -100, -300, -500]
/* Never in the black. */
const negative = [-100, -200, -300]

describe('the plot stays inside its box', () => {
  it('every point of a rising month is within the drawable area', () => {
    const { path } = netChartGeometry({ cumNet: rising, daysInMonth: 5 })
    ys(path).forEach((y) => {
      expect(y).toBeGreaterThanOrEqual(PLOT_TOP - 0.05)
      expect(y).toBeLessThanOrEqual(PLOT_BOTTOM + 0.05)
    })
  })

  it('so does a month that crosses zero', () => {
    const { path } = netChartGeometry({ cumNet: crossing, daysInMonth: 5 })
    ys(path).forEach((y) => {
      expect(y).toBeGreaterThanOrEqual(PLOT_TOP - 0.05)
      expect(y).toBeLessThanOrEqual(PLOT_BOTTOM + 0.05)
    })
  })

  it('the first point sits on the left edge and the last on the right', () => {
    const width = 320
    const { path } = netChartGeometry({ cumNet: rising, daysInMonth: 5, width })
    const x = xs(path)
    expect(x[0]).toBeCloseTo(CHART_PAD_X, 1)
    expect(x[x.length - 1]).toBeCloseTo(width - CHART_PAD_X, 1)
  })
})

describe('zero is always on the canvas', () => {
  it('a month entirely in the black still has zero in range', () => {
    const { zeroY } = netChartGeometry({ cumNet: rising, daysInMonth: 5 })
    expect(zeroY).toBeGreaterThanOrEqual(PLOT_TOP)
    expect(zeroY).toBeLessThanOrEqual(PLOT_BOTTOM + 0.05)
  })

  it('a month entirely in the red has zero in range too', () => {
    const { zeroY } = netChartGeometry({ cumNet: negative, daysInMonth: 3 })
    expect(zeroY).toBeGreaterThanOrEqual(PLOT_TOP - 0.05)
    expect(zeroY).toBeLessThanOrEqual(PLOT_BOTTOM)
  })

  it('a negative value is drawn BELOW the zero line, never above it', () => {
    const { path, zeroY } = netChartGeometry({ cumNet: crossing, daysInMonth: 5 })
    const pts = ys(path)
    /* crossing = [300, 100, -100, -300, -500] — y grows downward in SVG. */
    expect(pts[0]).toBeLessThan(zeroY)      // +300 above the line
    expect(pts[2]).toBeGreaterThan(zeroY)   // −100 below it
    expect(pts[4]).toBeGreaterThan(zeroY)   // −500 further below
  })

  it('the baseline is only drawn when the month actually goes negative', () => {
    expect(netChartGeometry({ cumNet: rising, daysInMonth: 5 }).showZeroLine).toBe(false)
    expect(netChartGeometry({ cumNet: crossing, daysInMonth: 5 }).showZeroLine).toBe(true)
    expect(netChartGeometry({ cumNet: negative, daysInMonth: 3 }).showZeroLine).toBe(true)
  })
})

describe('the area is filled against zero, not against the floor', () => {
  it('a rising month closes its area on the zero baseline', () => {
    const { area, zeroY } = netChartGeometry({ cumNet: rising, daysInMonth: 5 })
    const closing = ys(area).slice(-2)
    closing.forEach((y) => expect(y).toBeCloseTo(zeroY, 1))
  })

  it('a losing month closes on the SAME baseline — so the fill hangs below the line', () => {
    /* This is the regression that matters: closing on the bottom of the box
       would shade the whole plot and make a loss look like a gain. */
    const { area, zeroY } = netChartGeometry({ cumNet: negative, daysInMonth: 3 })
    const closing = ys(area).slice(-2)
    closing.forEach((y) => expect(y).toBeCloseTo(zeroY, 1))
    expect(zeroY).toBeLessThan(PLOT_BOTTOM) // and that baseline is NOT the floor
  })

  it('the area starts from the line itself', () => {
    const { path, area } = netChartGeometry({ cumNet: crossing, daysInMonth: 5 })
    expect(area.startsWith(path)).toBe(true)
  })
})

describe('the income-goal marker', () => {
  it('is absent when no goal is set', () => {
    expect(netChartGeometry({ cumNet: rising, daysInMonth: 5 }).goalY).toBeNull()
    expect(netChartGeometry({ cumNet: rising, daysInMonth: 5, targetValue: 0 }).goalY).toBeNull()
  })

  it('never stretches the axis — the net line keeps the full height', () => {
    /* The regression that made this rule: an income goal is routinely several
       times the net, and letting it into the scale flattened the line into an
       unreadable band. The plotted line must be identical with and without a
       goal set. */
    const withGoal = netChartGeometry({ cumNet: crossing, daysInMonth: 5, targetValue: 50000 })
    const without = netChartGeometry({ cumNet: crossing, daysInMonth: 5 })
    expect(withGoal.path).toBe(without.path)
    expect(withGoal.zeroY).toBeCloseTo(without.zeroY, 5)
  })

  it('the net line still spans a usable share of the plot under a huge goal', () => {
    const { path } = netChartGeometry({ cumNet: crossing, daysInMonth: 5, targetValue: 50000 })
    const span = Math.max(...ys(path)) - Math.min(...ys(path))
    expect(span).toBeGreaterThan((PLOT_BOTTOM - PLOT_TOP) * 0.5)
  })

  it('is pinned to the edge and FLAGGED when the goal is out of range', () => {
    const { goalY, goalClamped } = netChartGeometry({ cumNet: rising, daysInMonth: 5, targetValue: 50000 })
    expect(goalClamped).toBe(true)
    expect(goalY).toBeCloseTo(PLOT_TOP, 1)
  })

  it('sits at its true height, unflagged, when the goal falls inside the range', () => {
    /* rising tops out at 500, so a 300 goal genuinely lands mid-plot. */
    const { goalY, goalClamped, yScale } = netChartGeometry({ cumNet: rising, daysInMonth: 5, targetValue: 300 })
    expect(goalClamped).toBe(false)
    expect(goalY).toBeCloseTo(yScale(300), 5)
    expect(goalY).toBeGreaterThan(PLOT_TOP)
    expect(goalY).toBeLessThan(PLOT_BOTTOM)
  })

  it('stays above zero, since an income goal is always positive', () => {
    const { goalY, zeroY } = netChartGeometry({ cumNet: crossing, daysInMonth: 5, targetValue: 1000 })
    expect(goalY).toBeLessThan(zeroY)
  })
})

describe('the today dot follows the net line', () => {
  it('lands on the value for its own index', () => {
    const { path, todayX, todayY } = netChartGeometry({ cumNet: crossing, daysInMonth: 5, todayIdx: 2 })
    expect(todayX).toBeCloseTo(xs(path)[2], 1)
    expect(todayY).toBeCloseTo(ys(path)[2], 1)
  })

  it('handles a negative "today" value', () => {
    const { todayY, zeroY } = netChartGeometry({ cumNet: crossing, daysInMonth: 5, todayIdx: 4 })
    expect(todayY).toBeGreaterThan(zeroY)
  })
})

describe('degenerate input does not produce NaN', () => {
  it('a flat all-zero month', () => {
    const g = netChartGeometry({ cumNet: [0, 0, 0], daysInMonth: 3 })
    ys(g.path).forEach((y) => expect(Number.isFinite(y)).toBe(true))
    expect(Number.isFinite(g.zeroY)).toBe(true)
  })

  it('a single-day month', () => {
    const g = netChartGeometry({ cumNet: [250], daysInMonth: 1 })
    expect(Number.isFinite(g.todayX)).toBe(true)
    expect(Number.isFinite(g.todayY)).toBe(true)
    ys(g.path).forEach((y) => expect(Number.isFinite(y)).toBe(true))
  })

  it('an empty series yields no path rather than a broken one', () => {
    const g = netChartGeometry({ cumNet: [], daysInMonth: 0 })
    expect(g.path).toBe('')
    expect(g.area).toBe('')
  })
})
