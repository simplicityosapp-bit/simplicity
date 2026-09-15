/* ════════════════════════════════════════════════════════════════
   PRESSURE — how the mixed "הכל" list decides what you owe first.
   ════════════════════════════════════════════════════════════════
   Moved from apps/web/src/screens/tasks/pressure.js so the phone can rank
   the same rows the same way. The phone had no mixed list at all: tasks
   and reminders were two tabs, and a dated task was sprinkled into the
   reminders tab by date alone — the very arrangement web dropped because
   urgency was never an axis in it.

   The rule this exists to fix: ranking purely by the calendar put a task
   flagged דחוף with no deadline in the LAST group, under a reminder three
   weeks out. Grouping by priority had the mirror-image hole: only a task
   carries one, so an OVERDUE reminder sank below a task marked נמוך.

   Colours stay in each app (CSS vars on web, the palette on the phone);
   this module only knows the order.
   ════════════════════════════════════════════════════════════════ */

export type PressureKey = 'overdue' | 'today' | 'urgent' | 'week' | 'later' | 'undated'
export type DateBucketKey = 'overdue' | 'today' | 'week' | 'later'

export interface PressureItem {
  kind: 'task' | 'reminder'
  when?: string | null
  task?: { priority?: string | null } | null
}

/* Priority tie-break inside a bucket, same order the home widget uses. */
export const PORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

/* The pressure ladder: the date buckets with "דחוף" wedged in at the point
   where the calendar stops having anything urgent left to say. Everything at
   or above דחוף is something you owe now; everything below it is a plan. */
export const PRESSURE_KEYS: PressureKey[] = ['overdue', 'today', 'urgent', 'week', 'later', 'undated']

/* The three at the top read by the clock, not by a flag: "באיחור" leads with
   the oldest debt, "היום" is a day plan, and everything inside "דחוף" is
   already the same priority so there is nothing left for urgency to sort. */
export const CHRONO_PRESSURE = new Set<PressureKey>(['overdue', 'today', 'urgent'])

/* Map a due Date → bucket key against now. Shared by reminders and dated
   tasks so both land in the same overdue/today/week/later sections. */
export function dateToBucket(due: Date, now: Date): DateBucketKey | null {
  if (Number.isNaN(+due)) return null
  if (due < now) return 'overdue'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
  if (due < tomorrow) return 'today'
  if (due < weekEnd) return 'week'
  return 'later'
}

/* Where a mixed-list row sits on the pressure ladder. A passed or same-day
   deadline outranks everything — it is a fact about the clock, and it is the
   one thing that can be said about BOTH kinds. Only past that point does the
   flag get to speak, and only a task carries one: a reminder is a nudge, not a
   ranking, so it is never promoted out of its date bucket. */
export function pressureBucket(it: PressureItem, now: Date): PressureKey {
  const d = it.when ? new Date(it.when) : null
  const base = d && !Number.isNaN(+d) ? dateToBucket(d, now) : null
  if (base === 'overdue' || base === 'today') return base
  if (it.kind === 'task' && (it.task?.priority || 'medium') === 'high') return 'urgent'
  return base || 'undated'
}

const priorityOf = (it: PressureItem) => (it.kind === 'task' ? (it.task?.priority || 'medium') : 'medium')

/* Soonest first. Undated work (and a tie) falls back to urgency, then to a
   task ahead of a reminder — you act on a task, a reminder only tells you
   something. The same tie-breaks the home widget settled on. */
export const byPressure = (a: PressureItem, b: PressureItem): number => {
  const ta = a.when ? +new Date(a.when) : null
  const tb = b.when ? +new Date(b.when) : null
  if (ta !== null && tb !== null && ta !== tb) return ta - tb
  /* Only one side carries a deadline → that side leads. Without this the two
     fell through to the priority check, tied, and kept FETCH order — which
     inside "דחוף" (where every row is the same priority by definition) let an
     undated task sit above one actually due on Thursday. */
  if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1
  const pa = priorityOf(a)
  const pb = priorityOf(b)
  if (pa !== pb) return (PORDER[pa] ?? 1) - (PORDER[pb] ?? 1)
  if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1
  return 0
}

/* Urgency first, the deadline only breaking the tie — for the groups BELOW
   דחוף, where nothing is on fire and the calendar alone was making the call.
   A reminder is read as רגיל: it has no priority of its own. */
export const byUrgency = (a: PressureItem, b: PressureItem): number => {
  const pa = priorityOf(a)
  const pb = priorityOf(b)
  if (pa !== pb) return (PORDER[pa] ?? 1) - (PORDER[pb] ?? 1)
  return byPressure(a, b)
}

/* Tomorrow, keeping the item's own time of day. Measured from TODAY rather
   than from the item's own date: a reminder three weeks overdue pushed "one
   day on" from its stale date would still be overdue, which is not what
   anyone means by "דחה למחר". */
export function tomorrowAt(iso: string | null | undefined, now: Date = new Date()): string | null {
  const src = new Date(iso ?? '')
  if (!iso || Number.isNaN(+src)) return null
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, src.getHours(), src.getMinutes(), 0, 0).toISOString()
}

/* Postponing only makes sense while the date is today or already behind you.
   On something scheduled for next month "tomorrow" would drag it FORWARD. */
export function canPostpone(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(+d)) return false
  return d < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
}

/* Inside a task group the deadline decides the order — soonest first,
   undated last; ties keep fetch order. */
export function byDueDate(a: { due_at?: string | null }, b: { due_at?: string | null }): number {
  const ts = (x: { due_at?: string | null }) => {
    if (!x.due_at) return null
    const v = +new Date(x.due_at)
    return Number.isNaN(v) ? null : v
  }
  const da = ts(a)
  const db = ts(b)
  if (da === db) return 0
  if (da === null) return 1
  if (db === null) return -1
  return da - db
}

/* Finished work reads newest-first: completed_at for a task, the trigger-set
   updated_at for a reminder, the row's own date as a last resort. */
export function doneTimestamp(row: { completed_at?: string | null; updated_at?: string | null; due_at?: string | null; scheduled_at?: string | null }): number {
  const raw = row.completed_at || row.updated_at || row.due_at || row.scheduled_at
  const v = raw ? +new Date(raw) : NaN
  return Number.isNaN(v) ? 0 : v
}
export const byRecency = (a: Parameters<typeof doneTimestamp>[0], b: Parameters<typeof doneTimestamp>[0]): number =>
  doneTimestamp(b) - doneTimestamp(a)
