import { useCallback, useMemo } from 'react'
import { migrateReportsConfig, toggleReportMetric, moveReportMetric, resetReportMetrics } from '@simplicity/core'
import { usePreferences } from './usePreferences'

/* The saved reports layout (prefs.reports), shared with web — see core
   reportsConfig. Each edit reads the CURRENT prefs (the function form of
   update), so two quick taps can't write over each other. */
export function useReportsConfig() {
  const { prefs, update } = usePreferences()
  const config = useMemo(() => migrateReportsConfig(prefs?.reports), [prefs?.reports])
  const write = useCallback(
    (edit) => Promise.resolve(update((cur) => ({ reports: edit(migrateReportsConfig(cur?.reports)) }))).catch(() => {}),
    [update],
  )
  const toggleMetric = useCallback((id) => write((c) => toggleReportMetric(c, id)), [write])
  const moveMetric = useCallback((id, dir) => write((c) => moveReportMetric(c, id, dir)), [write])
  const resetMetrics = useCallback(() => write((c) => resetReportMetrics(c)), [write])
  return { config, toggleMetric, moveMetric, resetMetrics }
}
