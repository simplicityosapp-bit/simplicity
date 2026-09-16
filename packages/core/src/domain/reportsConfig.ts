/* ════════════════════════════════════════════════════════════════
   REPORTS CONFIG — which metrics show, in what order (prefs.reports).
   ════════════════════════════════════════════════════════════════
   Moved from apps/web/src/hooks/useReportsConfig so the phone reads the
   same saved layout. It didn't read it at all: a metric hidden or moved on
   web still showed, in the default place, on the phone.

   Shape: { view: 'list'|'table', range: 3|6|12, visibleMetrics, metricOrder }.
   Unknown metric ids are dropped; metrics added since are appended, shown.
   ════════════════════════════════════════════════════════════════ */

import { REPORT_METRICS } from './reports'

export interface ReportsConfig {
  view: 'list' | 'table'
  range: 3 | 6 | 12
  visibleMetrics: string[]
  metricOrder: string[]
}

const allIds = () => REPORT_METRICS.map((m) => m.id)

export function defaultReportsConfig(): ReportsConfig {
  return { view: 'list', range: 3, visibleMetrics: allIds(), metricOrder: allIds() }
}

export function migrateReportsConfig(cfg?: Partial<ReportsConfig> | Record<string, unknown> | null): ReportsConfig {
  const out = { ...defaultReportsConfig(), ...(cfg || {}) } as ReportsConfig
  if (!['list', 'table'].includes(out.view)) out.view = 'list'
  if (![3, 6, 12].includes(out.range)) out.range = 3
  if (!Array.isArray(out.visibleMetrics)) out.visibleMetrics = allIds()
  if (!Array.isArray(out.metricOrder)) out.metricOrder = allIds()
  const known = new Set(allIds())
  out.metricOrder = out.metricOrder.filter((id) => known.has(id))
  out.visibleMetrics = out.visibleMetrics.filter((id) => known.has(id))
  const orderSet = new Set(out.metricOrder)
  REPORT_METRICS.forEach((m) => {
    if (!orderSet.has(m.id)) {
      out.metricOrder.push(m.id)
      if (!out.visibleMetrics.includes(m.id)) out.visibleMetrics.push(m.id)
    }
  })
  return out
}

export function toggleReportMetric(cfg: ReportsConfig, id: string): ReportsConfig {
  const has = cfg.visibleMetrics.includes(id)
  return { ...cfg, visibleMetrics: has ? cfg.visibleMetrics.filter((x) => x !== id) : [...cfg.visibleMetrics, id] }
}

/* Remove `fromId` and insert it before `toId` (null = last) — web's drag. */
export function reorderReportMetric(cfg: ReportsConfig, fromId: string, toId: string | null | undefined): ReportsConfig {
  if (!fromId || fromId === toId) return cfg
  const order = [...cfg.metricOrder]
  const fromIdx = order.indexOf(fromId)
  if (fromIdx < 0) return cfg
  order.splice(fromIdx, 1)
  const toIdx = toId == null ? -1 : order.indexOf(toId)
  if (toIdx < 0) order.push(fromId)
  else order.splice(toIdx, 0, fromId)
  return { ...cfg, metricOrder: order }
}

/* One step up or down in the full order — the touch path, where there is no drag. */
export function moveReportMetric(cfg: ReportsConfig, id: string, dir: -1 | 1): ReportsConfig {
  const i = cfg.metricOrder.indexOf(id)
  if (i < 0) return cfg
  if (dir < 0) return i === 0 ? cfg : reorderReportMetric(cfg, id, cfg.metricOrder[i - 1])
  return i === cfg.metricOrder.length - 1 ? cfg : reorderReportMetric(cfg, id, cfg.metricOrder[i + 2] ?? null)
}

export function resetReportMetrics(cfg: ReportsConfig): ReportsConfig {
  return { ...cfg, visibleMetrics: allIds(), metricOrder: allIds() }
}

/* A figure as it goes into an exported spreadsheet: raw, money to two places,
   and empty — not 0 — when there is no value. */
export function reportExportValue(metric: { format?: string }, val: unknown): string {
  if (typeof val !== 'number') return ''
  return metric.format === 'money' ? val.toFixed(2) : String(val)
}
