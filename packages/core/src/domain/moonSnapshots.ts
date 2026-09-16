/* ════════════════════════════════════════════════════════════════
   MOON SNAPSHOTS — the recorded daily score, merged into the trend.
   ════════════════════════════════════════════════════════════════
   Moved from apps/web/src/screens/moon-glance so the phone's Moon screen
   draws the same line web does. A snapshot (moon_snapshots, one row per
   user per day) is what the score actually was that day; the live
   reconstruction (moonTrend) is an estimate from today's data. The line is
   the estimate with every recorded day laid over it — except today, whose
   snapshot is from the last visit and older than the ring above it.
   ════════════════════════════════════════════════════════════════ */

import { toLocalDate } from './scheduledMeetings'
import { OVERVIEW_METRICS } from './overview'

export interface MoonTrendPoint { date: Date; score: number | null }
export interface MoonSnapshotRow { date: string | Date; score?: number | null; confidence?: number | null }

/* YYYY-MM-DD in local time — the DATE column's own semantics. */
export function moonDayKey(d: string | number | Date = new Date()): string {
  const dt = typeof d === 'string' ? toLocalDate(d) : new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/* The live trend with recorded days laid over it. A snapshot's date is read
   as a local calendar day: `new Date('2026-09-01')` is UTC midnight, which
   west of Greenwich is the previous day and would move each point back one. */
export function mergeSnapshotTrend(liveTrend: MoonTrendPoint[], snapshots: MoonSnapshotRow[] | null | undefined, now: Date = new Date()): MoonTrendPoint[] {
  if (!snapshots || snapshots.length === 0) return liveTrend
  const today = moonDayKey(now)
  const byDay: Record<string, number> = Object.create(null)
  snapshots.forEach((s) => { byDay[moonDayKey(s.date)] = Number(s.confidence ?? s.score ?? 0) })
  return liveTrend.map((tp) => {
    const k = moonDayKey(tp.date)
    return (k !== today && k in byDay) ? { date: tp.date, score: byDay[k] } : tp
  })
}

/* Average, peak and the line's last point. Days with no score are left out
   rather than averaged as zeros, and each figure is null — printed as a dash —
   when there is nothing to measure yet. */
export function moonTrendStats(trend: MoonTrendPoint[]): { avg: number | null; peak: number | null; today: number | null } {
  const scores = (trend || []).map((tp) => tp.score).filter((s): s is number => s != null)
  if (!scores.length) return { avg: null, peak: null, today: null }
  return {
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    peak: Math.max(...scores),
    today: scores[scores.length - 1],
  }
}

/* Which overlay metrics a user keeps switched on (prefs.moonOverviewKeys).
   Unknown keys are dropped, so a retired metric can't resurrect a broken
   series from a saved blob; nothing saved means the default pair. */
export function readMoonOverviewKeys(prefs: { moonOverviewKeys?: unknown } | null | undefined): string[] {
  const saved = prefs?.moonOverviewKeys
  return Array.isArray(saved)
    ? saved.filter((k): k is string => typeof k === 'string' && k in OVERVIEW_METRICS)
    : ['income', 'score']
}
