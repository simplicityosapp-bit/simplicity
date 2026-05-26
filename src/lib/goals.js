/* ════════════════════════════════════════════════════════════════
   GOALS — grouping + value formatting (uses the moon score engine).
   ════════════════════════════════════════════════════════════════ */

import { moonGetData } from './moon'
import { isr } from './finance'
import { fmtShortDate } from './dates'

export function timeFrameLabel(goal) {
  if (goal.time_frame === 'monthly') return 'חודשי'
  if (goal.time_frame === 'weekly') return 'שבועי'
  if (goal.time_frame === 'deadline') return goal.target_date ? `עד ${fmtShortDate(goal.target_date)}` : 'יעד'
  return ''
}

/* Currency for transaction-backed categories, plain number otherwise. */
export function formatGoalValue(v, cat) {
  if (cat && cat.measurement_type === 'auto' && cat.data_source === 'transactions') return isr(v)
  return Math.round(v || 0).toLocaleString('he-IL')
}

/* Scored goals grouped by their category (only categories that have goals).
   `data` forwards real Supabase rows to the scoring engine; omitted → mock. */
export function goalsByCategory(now = new Date(), data) {
  const { scored } = moonGetData(now, data)
  const byCat = new Map()
  scored.forEach((s) => {
    if (!byCat.has(s.cat.id)) byCat.set(s.cat.id, { category: s.cat, goals: [] })
    byCat.get(s.cat.id).goals.push(s)
  })
  return [...byCat.values()]
}
