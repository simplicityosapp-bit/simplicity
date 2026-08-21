/* ════════════════════════════════════════════════════════════════
   PRESSURE — how the mixed "הכל" list decides what you owe first.

   Split out of the screen so a test can pin it (test/tasks-pressure.test.js),
   the way the leads board keeps matchLead apart from its own screen.
   These rules are the whole answer to "what should I do next", they have
   been wrong once already, and every one of them is the kind of rule a
   later tidy-up flattens back into a plain date sort.

   The rule this file exists to fix: the list used to rank purely by the
   calendar. A task flagged דחוף with no deadline landed in the LAST group,
   under a reminder three weeks out, and a דחוף task due Thursday sat below a
   trivial one due Monday — urgency was never an axis, only a tie-break
   inside a bucket the calendar had already chosen. The one alternative the
   screen offered, grouping by priority, had the mirror-image hole: only a
   task carries a priority, so every reminder fell into one tail group and an
   OVERDUE reminder ended up below a task marked נמוך.
   ════════════════════════════════════════════════════════════════ */

/* Priority tie-break inside a bucket, same order the home widget uses. */
export const PORDER = { high: 0, medium: 1, low: 2 }

/* The pressure ladder: the date buckets with "דחוף" wedged in at the point
   where the calendar stops having anything urgent left to say. Everything at
   or above דחוף is something you owe now; everything below it is a plan.

   דחוף wears --clay because that is what דחוף wears everywhere else on this
   screen — PRIORITY_COLOR.high and the .tc-tag-urgent chip both do. Yes, that
   is also באיחור's colour: they are the same claim (this is hot), and the
   group heading directly above the row says which kind of hot. Minting a new
   hue for it would have put a third meaning on the danger colour instead. */
export const PRESSURE_BUCKETS = [
  { key: 'overdue', color: 'var(--clay)' },
  { key: 'today',   color: 'var(--amber-warn)' },
  { key: 'urgent',  color: 'var(--clay)' },
  { key: 'week',    color: 'var(--sage)' },
  { key: 'later',   color: 'var(--mist)' },
  { key: 'undated', color: 'var(--stone)' },
]

/* The three at the top read by the clock, not by a flag: "באיחור" leads with
   the oldest debt, "היום" is a day plan, and everything inside "דחוף" is
   already the same priority so there is nothing left for urgency to sort. */
export const CHRONO_PRESSURE = new Set(['overdue', 'today', 'urgent'])

/* Map a due Date → bucket key against now. Shared by reminders and dated
   tasks so both land in the same overdue/today/week/later sections. */
export function dateToBucket(due, now) {
  if (Number.isNaN(+due)) return null
  if (due < now) return 'overdue'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  if (due < tomorrow) return 'today'
  if (due < weekEnd)  return 'week'
  return 'later'
}

/* Where a mixed-list row sits on the pressure ladder. A passed or same-day
   deadline outranks everything — it is a fact about the clock, and it is the
   one thing that can be said about BOTH kinds. Only past that point does the
   flag get to speak, and only a task carries one: a reminder is a nudge, not a
   ranking, so it is never promoted out of its date bucket. */
export function pressureBucket(it, now) {
  const d = it.when ? new Date(it.when) : null
  const base = d && !Number.isNaN(+d) ? dateToBucket(d, now) : null
  if (base === 'overdue' || base === 'today') return base
  if (it.kind === 'task' && (it.task.priority || 'medium') === 'high') return 'urgent'
  return base || 'undated'
}

/* Soonest first. Undated work (and a tie) falls back to urgency, then to a
   task ahead of a reminder — you act on a task, a reminder only tells you
   something. The same tie-breaks the home widget settled on. */
export const byPressure = (a, b) => {
  const ta = a.when ? +new Date(a.when) : null
  const tb = b.when ? +new Date(b.when) : null
  if (ta !== null && tb !== null && ta !== tb) return ta - tb
  /* Only one side carries a deadline → that side leads. Without this the two
     fell through to the priority check, tied, and kept FETCH order — which
     inside "דחוף" (where every row is the same priority by definition) let an
     undated task sit above one actually due on Thursday. byDueDate has always
     put undated work last for the same reason. */
  if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1
  const pa = a.kind === 'task' ? (a.task.priority || 'medium') : 'medium'
  const pb = b.kind === 'task' ? (b.task.priority || 'medium') : 'medium'
  if (pa !== pb) return (PORDER[pa] ?? 1) - (PORDER[pb] ?? 1)
  if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1
  return 0
}

/* Urgency first, the deadline only breaking the tie — for the groups BELOW
   דחוף, where nothing is on fire and the calendar alone was making the call.
   "רגיל" and "נמוך" are not the same claim on a Tuesday afternoon, and inside
   "ללא תאריך" there is no date to rank by at all. A reminder is read as רגיל:
   it has no priority of its own, and treating a missing flag as נמוך would
   bury every reminder under work merely marked normal. */
export const byUrgency = (a, b) => {
  const pa = a.kind === 'task' ? (a.task.priority || 'medium') : 'medium'
  const pb = b.kind === 'task' ? (b.task.priority || 'medium') : 'medium'
  if (pa !== pb) return (PORDER[pa] ?? 1) - (PORDER[pb] ?? 1)
  return byPressure(a, b)
}
