/* ════════════════════════════════════════════════════════════════
   PRESSURE — how the mixed "הכל" list decides what you owe first.
   ════════════════════════════════════════════════════════════════
   The rules live in @simplicity/core/domain/taskPressure, which the phone's
   tasks screen ranks by too (test/tasks-pressure.test.js still pins them,
   through this re-export). What stays here is web's own: the colour each
   band wears.

   דחוף wears --clay because that is what דחוף wears everywhere else on this
   screen — PRIORITY_COLOR.high and the .tc-tag-urgent chip both do. Yes, that
   is also באיחור's colour: they are the same claim (this is hot), and the
   group heading directly above the row says which kind of hot.
   ════════════════════════════════════════════════════════════════ */
export { PORDER, CHRONO_PRESSURE, dateToBucket, pressureBucket, byPressure, byUrgency } from '@simplicity/core'

const BAND_COLOR = {
  overdue: 'var(--clay)',
  today: 'var(--amber-warn)',
  urgent: 'var(--clay)',
  week: 'var(--sage)',
  later: 'var(--mist)',
  undated: 'var(--stone)',
}

export const PRESSURE_BUCKETS = ['overdue', 'today', 'urgent', 'week', 'later', 'undated']
  .map((key) => ({ key, color: BAND_COLOR[key] }))
