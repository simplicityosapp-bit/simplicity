/* The saved reports layout — shared by web and, now, the phone. */
import { describe, it, expect } from 'vitest'
import { REPORT_METRICS, migrateReportsConfig, toggleReportMetric, moveReportMetric, reorderReportMetric, resetReportMetrics, reportExportValue } from '../src'

const ids = REPORT_METRICS.map((m) => m.id)

describe('migrateReportsConfig', () => {
  it('drops ids that no longer exist and appends new metrics as shown', () => {
    const cfg = migrateReportsConfig({ view: 'table', range: 6, visibleMetrics: ['income', 'gone'], metricOrder: ['income', 'gone'] })
    expect(cfg.view).toBe('table')
    expect(cfg.range).toBe(6)
    expect(cfg.metricOrder[0]).toBe('income')
    expect(cfg.metricOrder).toHaveLength(ids.length)
    expect(cfg.metricOrder).not.toContain('gone')
    expect(cfg.visibleMetrics).toEqual(expect.arrayContaining(ids))
  })

  it('repairs a bad view or range', () => {
    expect(migrateReportsConfig({ view: 'grid' as never, range: 5 as never })).toMatchObject({ view: 'list', range: 3 })
  })
})

describe('metric edits', () => {
  const base = migrateReportsConfig(null)

  it('hides and shows', () => {
    const hidden = toggleReportMetric(base, 'income')
    expect(hidden.visibleMetrics).not.toContain('income')
    expect(toggleReportMetric(hidden, 'income').visibleMetrics).toContain('income')
  })

  it('moves one step each way and stops at the ends', () => {
    expect(moveReportMetric(base, ids[1], -1).metricOrder.slice(0, 2)).toEqual([ids[1], ids[0]])
    expect(moveReportMetric(base, ids[0], 1).metricOrder.slice(0, 2)).toEqual([ids[1], ids[0]])
    expect(moveReportMetric(base, ids[ids.length - 2], 1).metricOrder.slice(-2)).toEqual([ids[ids.length - 1], ids[ids.length - 2]])
    expect(moveReportMetric(base, ids[0], -1)).toBe(base)
    expect(moveReportMetric(base, ids[ids.length - 1], 1)).toBe(base)
  })

  it('reorders before a target, or to the end', () => {
    expect(reorderReportMetric(base, ids[0], null).metricOrder.at(-1)).toBe(ids[0])
  })

  it('resets to every metric in the default order', () => {
    const messy = toggleReportMetric(moveReportMetric(base, ids[3], -1), ids[0])
    expect(resetReportMetrics(messy)).toMatchObject({ visibleMetrics: ids, metricOrder: ids })
  })
})

describe('reportExportValue', () => {
  it('writes money to two places and nothing for a missing value', () => {
    expect(reportExportValue({ format: 'money' }, 1200)).toBe('1200.00')
    expect(reportExportValue({ format: 'count' }, 3)).toBe('3')
    expect(reportExportValue({ format: 'count' }, null)).toBe('')
  })
})
