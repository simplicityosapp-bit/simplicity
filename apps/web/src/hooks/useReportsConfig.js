import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  migrateReportsConfig, defaultReportsConfig, toggleReportMetric, reorderReportMetric, resetReportMetrics,
} from '@simplicity/core'
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

/* The config shape, its migration and the metric edits live in core
   (reportsConfig), shared with the phone; re-exported for this module's callers. */
export { migrateReportsConfig }
const defaults = defaultReportsConfig

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
    writeReports((c) => toggleReportMetric(c, id))
  }, [writeReports])

  const reorderMetric = useCallback((fromId, toId) => {
    if (!fromId || fromId === toId) return
    writeReports((c) => reorderReportMetric(c, fromId, toId))
  }, [writeReports])

  const resetConfig = useCallback(() => {
    writeReports((c) => resetReportMetrics(c))
  }, [writeReports])

  return { config, setView, setRange, toggleMetric, reorderMetric, resetConfig }
}
