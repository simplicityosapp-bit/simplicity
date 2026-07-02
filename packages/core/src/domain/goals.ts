/* ════════════════════════════════════════════════════════════════
   GOALS — grouping + value formatting (uses the moon score engine).
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'
import { moonGetData, type MoonData, type ScoredGoal } from './moon'
import { isr } from './finance'
import { fmtShortDate } from './dates'

export function timeFrameLabel(goal: { time_frame?: string; target_date?: string | null }): string {
  if (goal.time_frame === 'monthly') return 'חודשי'
  if (goal.time_frame === 'weekly') return 'שבועי'
  if (goal.time_frame === 'deadline') return goal.target_date ? `עד ${fmtShortDate(goal.target_date)}` : 'יעד'
  return ''
}

/* Currency for transaction-backed categories, plain number otherwise. */
export function formatGoalValue(v: unknown, cat?: { measurement_type?: string; data_source?: string } | null): string {
  /* coerce first — a stray string ("NaN", "") would otherwise render the
     literal "NaN" via Math.round("NaN"). Always resolve to a real number. */
  const n = Number(v)
  const safe = Number.isFinite(n) ? n : 0
  if (cat && cat.measurement_type === 'auto' && cat.data_source === 'transactions') return isr(safe)
  const locale = i18n.language === 'he' ? 'he-IL' : (i18n.language || 'he-IL')
  return Math.round(safe).toLocaleString(locale)
}

/* ════════════════════════════════════════════════════════════════
   Yes/no goal model — the goal is "answer yes on the scheduled days".
   The number of times the question appears in the goal's period is the
   CEILING for the target: you can aim to say "yes" on fewer days than
   it's asked (run 3×/week while asked 5× is fine), but not more than it
   appears (target 5 while asked twice is impossible).
   ════════════════════════════════════════════════════════════════ */

const DAYS_PER_TIMEFRAME: Record<string, number> = { weekly: 7, monthly: 30 }

interface SchedulePattern {
  type?: string
  values?: number[]
  x?: number | string
}

/* How many days the period spans, for occurrence math. Deadline uses the
   gap to the target date (min 1 day). */
function periodDays(timeFrame?: string, targetDate?: string | null): number {
  if (timeFrame === 'deadline') {
    if (!targetDate) return 1
    const ms = new Date(targetDate + 'T12:00:00').getTime() - Date.now()
    return Math.max(1, Math.ceil(ms / 86400000))
  }
  return DAYS_PER_TIMEFRAME[timeFrame ?? ''] || 30
}

/* How many times a scheduled question is expected to appear within the
   goal's period — the max sensible yes/no target. A days_of_week pattern
   recurs weekly; every_x_days divides the span; "every day" (no pattern)
   is one per day. Returns a whole number ≥ 0. */
export function scheduledOccurrences(schedulePattern: SchedulePattern | null | undefined, timeFrame?: string, targetDate?: string | null): number {
  const span = periodDays(timeFrame, targetDate)
  const p = schedulePattern
  if (p && p.type === 'days_of_week' && Array.isArray(p.values) && p.values.length && p.values.length < 7) {
    const weeks = span / 7
    return Math.max(1, Math.round(p.values.length * weeks))
  }
  if (p && p.type === 'every_x_days') {
    const x = Math.max(1, Number(p.x) || 1)
    return Math.max(1, Math.floor(span / x))
  }
  /* every day / no pattern */
  return span
}

/* Build a schedule_pattern from the editor's mode + inputs (shared shape
   used by the question schedule editor and the goal forms). null means
   "every day". */
export function buildSchedulePattern(mode?: string, days?: number[], x?: string | number): SchedulePattern | null {
  if (mode === 'days_of_week') {
    const v = (days || []).slice().sort((a, b) => a - b)
    return v.length === 7 || v.length === 0 ? null : { type: 'days_of_week', values: v }
  }
  if (mode === 'every_x_days') {
    const xi = Math.max(1, Math.min(30, parseInt(x as string, 10) || 1))
    return xi <= 1 ? null : { type: 'every_x_days', x: xi }
  }
  return null
}

/* Scored goals grouped by their category (only categories that have goals).
   `data` forwards real Supabase rows to the scoring engine; omitted → mock. */
export function goalsByCategory(now: Date = new Date(), data?: MoonData) {
  const { scored } = moonGetData(now, data)
  const byCat = new Map<string, { category: ScoredGoal['cat']; goals: ScoredGoal[] }>()
  scored.forEach((s) => {
    if (!byCat.has(s.cat.id)) byCat.set(s.cat.id, { category: s.cat, goals: [] })
    byCat.get(s.cat.id)!.goals.push(s)
  })
  return [...byCat.values()]
}
