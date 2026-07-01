import { useCallback, useEffect, useMemo, useRef } from 'react'
import { REPORT_METRICS } from '../lib/reports'
import { useUserPreferences } from './useUserPreferences'

/* ════════════════════════════════════════════════════════════════
   useReportsConfig — view / range / visible metrics / metric order
                       persisted under user_preferences.reports.
   ════════════════════════════════════════════════════════════════
   Shape:
     {
       view:           'list' | 'table',
       range:          3 | 6 | 12,
       visibleMetrics: [metricId, …],
       metricOrder:    [metricId, …],
     }
   Auto-migrates: unknown metric ids dropped; new ones appended.
   First-load migration also rescues a pre-Supabase localStorage
   blob (mg-reports-config) so an existing user doesn't lose their
   chosen layout when they upgrade.
   ════════════════════════════════════════════════════════════════ */

const LEGACY_KEY = 'mg-reports-config'

function defaults() {
  return {
    view: 'list',
    range: 3,
    visibleMetrics: REPORT_METRICS.map((m) => m.id),
    metricOrder: REPORT_METRICS.map((m) => m.id),
  }
}

export function migrateReportsConfig(cfg) {
  const out = { ...defaults(), ...(cfg || {}) }
  if (!['list', 'table'].includes(out.view)) out.view = 'list'
  if (![3, 6, 12].includes(out.range)) out.range = 3
  if (!Array.isArray(out.visibleMetrics)) out.visibleMetrics = REPORT_METRICS.map((m) => m.id)
  if (!Array.isArray(out.metricOrder)) out.metricOrder = REPORT_METRICS.map((m) => m.id)
  /* Drop unknowns + auto-extend with new metrics. */
  const known = new Set(REPORT_METRICS.map((m) => m.id))
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

/* Read any legacy localStorage blob (pre-Supabase) so we can lift it
   over to user_preferences on first load. */
function readLegacy() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_KEY) : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useReportsConfig() {
  const { prefs, update } = useUserPreferences()
  const legacyLifted = useRef(false)

  /* If prefs are loaded and reports is missing — fall back to legacy
     localStorage once (then forget about it). Otherwise use prefs. */
  const config = useMemo(() => {
    if (!prefs) return defaults()
    if (prefs.reports) return migrateReportsConfig(prefs.reports)
    const legacy = readLegacy()
    return migrateReportsConfig(legacy)
  }, [prefs])

  /* One-time lift of legacy localStorage value into prefs (on the first
     render where prefs are loaded AND prefs.reports is missing AND
     localStorage has something). After lift, we wipe the local copy so
     it doesn't shadow future updates from another device. */
  useEffect(() => {
    if (legacyLifted.current) return
    if (!prefs) return
    if (prefs.reports) { legacyLifted.current = true; return }
    const legacy = readLegacy()
    if (!legacy) { legacyLifted.current = true; return }
    legacyLifted.current = true
    update({ reports: migrateReportsConfig(legacy) })
    try { localStorage.removeItem(LEGACY_KEY) } catch { /* noop */ }
  }, [prefs, update])

  const writeReports = useCallback((patch) => {
    const cur = config
    const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch }
    update({ reports: next })
  }, [config, update])

  const setView = useCallback((view) => {
    writeReports({ view: view === 'table' ? 'table' : 'list' })
  }, [writeReports])

  const setRange = useCallback((n) => {
    const safe = [3, 6, 12].includes(n) ? n : 3
    writeReports({ range: safe })
  }, [writeReports])

  const toggleMetric = useCallback((id) => {
    writeReports((c) => {
      const has = c.visibleMetrics.includes(id)
      const visibleMetrics = has
        ? c.visibleMetrics.filter((x) => x !== id)
        : [...c.visibleMetrics, id]
      return { ...c, visibleMetrics }
    })
  }, [writeReports])

  const reorderMetric = useCallback((fromId, toId) => {
    if (!fromId || fromId === toId) return
    writeReports((c) => {
      const order = [...c.metricOrder]
      const fromIdx = order.indexOf(fromId)
      if (fromIdx < 0) return c
      order.splice(fromIdx, 1)
      if (toId == null) {
        order.push(fromId)
      } else {
        const toIdx = order.indexOf(toId)
        if (toIdx < 0) order.push(fromId)
        else order.splice(toIdx, 0, fromId)
      }
      return { ...c, metricOrder: order }
    })
  }, [writeReports])

  const resetConfig = useCallback(() => {
    writeReports((c) => ({
      ...c,
      visibleMetrics: REPORT_METRICS.map((m) => m.id),
      metricOrder: REPORT_METRICS.map((m) => m.id),
    }))
  }, [writeReports])

  return { config, setView, setRange, toggleMetric, reorderMetric, resetConfig }
}
