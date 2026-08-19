/* ════════════════════════════════════════════════════════════════
   THE ARROW POINTS THE WAY IT MOVED; THE COLOUR SAYS IF THAT IS GOOD.
   ════════════════════════════════════════════════════════════════
   Those are two different axes and conflating them is the whole bug this
   guards against. Expenses rising, open tasks piling up at month end and a
   climbing mid-process drop-out rate all point UP, and every one of them is
   bad news. "Leads closed" has no good direction at all — closing covers
   conversions and dead ends alike — so it must never colour either way.

   The other half is the null case: a month with no value is an UNKNOWN, not
   a change of zero. A practice with no inquiries yet must not be told it saw
   "no change since last month".
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import { initI18n } from '@simplicity/core/i18n'
import {
  REPORT_METRICS,
  getPreviousPeriod,
  computeReportDelta,
  reportDeltaTone,
  formatReportDelta,
} from '@simplicity/core'

/* formatReportDelta reaches isr() for money, which reads the active
   language to pick a number locale. */
beforeAll(async () => { await initI18n({ lng: 'he' }) })

const metric = (id) => REPORT_METRICS.find((m) => m.id === id)

describe('the good direction of every metric is declared', () => {
  it('leaves no metric without an axis', () => {
    const missing = REPORT_METRICS.filter((m) => !m.good).map((m) => m.id)
    expect(missing).toEqual([])
  })

  it('treats a rise as good news only where a rise IS good news', () => {
    const rising = (id) => reportDeltaTone(metric(id), +1)
    expect(rising('newInquiries')).toBe('good')
    expect(rising('leadsConverted')).toBe('good')
    expect(rising('conversionRate')).toBe('good')
    expect(rising('newClients')).toBe('good')
    expect(rising('activeClientsAtEnd')).toBe('good')
    expect(rising('sessions')).toBe('good')
    expect(rising('income')).toBe('good')
    expect(rising('net')).toBe('good')
    expect(rising('tasksCompleted')).toBe('good')

    /* Up, and bad. The three that direction alone would paint green. */
    expect(rising('expense')).toBe('bad')
    expect(rising('openTasksAtEnd')).toBe('bad')
    expect(rising('leftMidProcessPct')).toBe('bad')
  })

  it('mirrors the tone when the same metrics fall', () => {
    expect(reportDeltaTone(metric('income'), -1)).toBe('bad')
    expect(reportDeltaTone(metric('expense'), -1)).toBe('good')
    expect(reportDeltaTone(metric('leftMidProcessPct'), -1)).toBe('good')
    expect(reportDeltaTone(metric('openTasksAtEnd'), -1)).toBe('good')
  })

  it('never colours "leads closed", which has no good direction', () => {
    expect(reportDeltaTone(metric('leadsClosed'), +5)).toBe('flat')
    expect(reportDeltaTone(metric('leadsClosed'), -5)).toBe('flat')
  })

  it('treats no movement as flat, whatever the metric', () => {
    expect(reportDeltaTone(metric('income'), 0)).toBe('flat')
    expect(reportDeltaTone(metric('expense'), 0)).toBe('flat')
  })
})

describe('a missing month is unknown, not unchanged', () => {
  it('returns null when either side has no value', () => {
    expect(computeReportDelta(null, 5)).toBeNull()
    expect(computeReportDelta(5, null)).toBeNull()
    expect(computeReportDelta(undefined, 5)).toBeNull()
    expect(computeReportDelta(null, null)).toBeNull()
  })

  it('has no tone and no text for a null delta', () => {
    expect(reportDeltaTone(metric('income'), null)).toBeNull()
    expect(formatReportDelta(metric('income'), null)).toBe('')
  })

  it('still reports a real drop to zero', () => {
    expect(computeReportDelta(0, 4)).toBe(-4)
    expect(reportDeltaTone(metric('sessions'), -4)).toBe('bad')
  })
})

describe('how the change is written', () => {
  it('signs counts, and uses a real minus rather than a hyphen', () => {
    expect(formatReportDelta(metric('sessions'), 3)).toBe('+3')
    expect(formatReportDelta(metric('sessions'), -3)).toBe('−3')
  })

  it('keeps the currency symbol on money', () => {
    expect(formatReportDelta(metric('income'), 1200)).toBe('+₪1,200')
    expect(formatReportDelta(metric('net'), -820)).toBe('−₪820')
  })

  /* A percentage delta is a difference in PERCENTAGE POINTS. Writing "+5%"
     beside a rate of 30% would claim a 5% relative rise, which is a
     different and wrong number. */
  it('leaves a percentage change bare, with no % sign', () => {
    expect(formatReportDelta(metric('conversionRate'), 5)).toBe('+5')
    expect(formatReportDelta(metric('conversionRate'), 5)).not.toContain('%')
  })

  it('marks no change with an equals sign', () => {
    expect(formatReportDelta(metric('income'), 0)).toBe('=')
  })
})

describe('the month being compared against', () => {
  it('steps back one calendar month', () => {
    const prev = getPreviousPeriod({ year: 2026, month: 7 })   /* August */
    expect(prev.year).toBe(2026)
    expect(prev.month).toBe(6)                                  /* July */
    expect(prev.start.getDate()).toBe(1)
    expect(prev.end.getDate()).toBe(31)
    expect(prev.isCurrent).toBe(false)
  })

  it('crosses the year boundary', () => {
    const prev = getPreviousPeriod({ year: 2026, month: 0 })    /* January */
    expect(prev.year).toBe(2025)
    expect(prev.month).toBe(11)                                 /* December */
  })

  /* February, and a leap year — the end of the previous month is computed,
     never assumed to be the 30th. */
  it('lands on the real last day of a short month', () => {
    expect(getPreviousPeriod({ year: 2026, month: 2 }).end.getDate()).toBe(28)
    expect(getPreviousPeriod({ year: 2024, month: 2 }).end.getDate()).toBe(29)
  })

  /* The pill strip spans twelve months, but the tables hold everything. The
     month before the oldest pill is a real month and must be comparable. */
  it('does not care that the month falls outside the 12-month strip', () => {
    const prev = getPreviousPeriod({ year: 2020, month: 5 })
    expect(prev.year).toBe(2020)
    expect(prev.month).toBe(4)
    expect(prev.label).toBeTruthy()
  })
})
