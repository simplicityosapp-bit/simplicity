/* ════════════════════════════════════════════════════════════════
   TASKS-AND-REMINDERS SUITE — the home "משימות ותזכורות" widget
   (core domain/home tasksAndReminders).

   Two cards used to sit side by side — open tasks, and upcoming reminders —
   splitting one question (what do I still owe?) across two boxes with two
   summaries. They are now one pressure-ordered list.

   Two rules this suite pins down, because both are easy to break by
   "tidying" the ranking later:

   1. Home used to sort tasks by PRIORITY and never render a date, even
      though `tasks.due_at` exists, AddTaskModal writes it, and the tasks
      screen buckets by it. A task due this morning sat below one merely
      flagged urgent with no deadline at all.

   2. A reminder CAN be overdue here — reversed 2026-08-24, and the reason
      is worth keeping. The old rule (a reminder is never late; the window
      never looks back past today) was an owner decision from 2026-07-19 made
      about the CALENDAR: reminders are action items, not history, so the grid
      does not backfill them. remindersUpcoming applied it to every caller —
      and this card is not a calendar, it is the list of what you owe. The
      result was a reminder set for yesterday sitting on the tasks screen under
      "באיחור" and appearing NOWHERE on the home screen.
      The calendar keeps the old rule; only callers passing includeOverdue see
      a past-due reminder. Home and the tasks screen now use one threshold, so
      the same row can never read "היום" on one and "באיחור" on the other.

   Fixtures use local Date constructors; the code buckets by local parts.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { tasksAndReminders } from '@simplicity/core'

const now = new Date(2026, 6, 21, 14, 0, 0) // Tue 2026-07-21, 14:00 local
const at = (day, h, m = 0) => new Date(2026, 6, day, h, m, 0).toISOString()

const tasks = [
  { id: 'low-undated', title: 'לקרוא מאמר', priority: 'low', status: 'todo' },
  { id: 'high-undated', title: 'לחזור למיכל', priority: 'high', status: 'todo' },
  { id: 'due-today-late', title: 'להכין חומרים', priority: 'low', status: 'todo', due_at: at(21, 18) },
  { id: 'overdue-days', title: 'להגיש דוח', priority: 'low', status: 'todo', due_at: at(19, 12) },
  { id: 'overdue-hours', title: 'לשלוח חוזה', priority: 'medium', status: 'todo', due_at: at(21, 10) },
  { id: 'high-next-week', title: 'לתכנן סדנה', priority: 'high', status: 'todo', due_at: at(28, 9) },
  { id: 'med-tomorrow', title: 'לעדכן את האתר', priority: 'medium', status: 'todo', due_at: at(22, 9) },
  { id: 'done', title: 'בוצע', priority: 'high', status: 'done', due_at: at(19, 9) },
  { id: 'deleted', title: 'נמחק', priority: 'high', status: 'todo', due_at: at(19, 9), deleted_at: at(20, 9) },
]

const reminders = [
  { id: 'rem-earlier-today', title: 'להתקשר לספק', scheduled_at: at(21, 9), status: 'pending' },
  { id: 'rem-later-today', title: 'לאסוף חבילה', scheduled_at: at(21, 20), status: 'pending' },
  { id: 'rem-next-week', title: 'לחדש ביטוח', scheduled_at: at(27, 9), status: 'pending' },
  { id: 'rem-yesterday', title: 'תזכורת מאתמול', scheduled_at: at(20, 9), status: 'pending' },
  { id: 'rem-done', title: 'בוצעה', scheduled_at: at(21, 11), status: 'completed' },
]

const items = tasksAndReminders(0, { tasks, reminders }, now)
const ids = items.map((i) => i.id)
const find = (id) => items.find((i) => i.id === id)

describe('tasksAndReminders — both kinds in one list', () => {
  it('carries tasks and reminders together', () => {
    expect(ids).toContain('task-high-undated')
    expect(ids).toContain('rem-rem-later-today')
  })

  it('drops done and deleted rows of either kind', () => {
    expect(ids).not.toContain('task-done')
    expect(ids).not.toContain('task-deleted')
    expect(ids).not.toContain('rem-rem-done')
  })

  it('gives every row an id, kind, title and bucket', () => {
    for (const it of items) {
      expect(it.id).toBeTruthy()
      expect(['task', 'reminder']).toContain(it.kind)
      expect(typeof it.title).toBe('string')
      expect(['overdue', 'today', 'upcoming', 'undated']).toContain(it.bucket)
    }
  })

  it('keeps ids unique across both kinds', () => {
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/* ── REVERSED, deliberately (owner decision 2026-08-24) ──────────────
   This block used to pin the opposite: a reminder was never overdue and
   yesterday's never appeared at all. That rule came from 2026-07-19 and it
   was made about the CALENDAR — reminders are action items, not history, so
   the grid does not backfill them. remindersUpcoming applied it to every
   caller, and this card is not a calendar: it is the list of what you owe.
   A reminder set for yesterday and never ticked was showing on the tasks
   screen under "באיחור" and nowhere on the home screen at all.

   The calendar keeps the old rule. Only the callers that pass
   includeOverdue see a past-due reminder — see remindersUpcoming. */
describe('tasksAndReminders — a reminder CAN be late', () => {
  it('surfaces yesterday\'s untouched reminder instead of dropping it', () => {
    expect(ids).toContain('rem-rem-yesterday')
    expect(find('rem-rem-yesterday').bucket).toBe('overdue')
  })

  it('counts a moment that has passed TODAY as late, matching the tasks screen', () => {
    /* 09:00 read at 14:00. The two surfaces now use one threshold, so the
       same reminder can never read "היום" here and "באיחור" there. */
    expect(find('rem-rem-earlier-today').bucket).toBe('overdue')
  })

  it('still leaves a reminder still to come alone', () => {
    expect(find('rem-rem-later-today').bucket).toBe('today')
    expect(find('rem-rem-next-week').bucket).toBe('upcoming')
  })

  it('never marks a COMPLETED reminder late, however old', () => {
    expect(ids).not.toContain('rem-rem-done')
  })

  it('has both kinds in the overdue band now, not tasks alone', () => {
    const overdue = items.filter((i) => i.bucket === 'overdue')
    expect(overdue.some((i) => i.kind === 'task')).toBe(true)
    expect(overdue.some((i) => i.kind === 'reminder')).toBe(true)
  })
})

describe('tasksAndReminders — ordered by pressure', () => {
  it('puts everything overdue first, oldest leading, both kinds interleaved', () => {
    /* 19th 12:00 · 20th 09:00 · 21st 09:00 · 21st 10:00 — the clock decides,
       not the kind. */
    expect(ids.slice(0, 4)).toEqual([
      'task-overdue-days', 'rem-rem-yesterday', 'rem-rem-earlier-today', 'task-overdue-hours',
    ])
  })

  it('THE regression: a low-priority task due today outranks an undated urgent one', () => {
    /* Priority-only sorting had this exactly backwards. */
    expect(ids.indexOf('task-due-today-late')).toBeLessThan(ids.indexOf('task-high-undated'))
  })

  it('interleaves today\'s reminders with today\'s tasks by time', () => {
    const today = items.filter((i) => i.bucket === 'today').map((i) => i.id)
    expect(today).toEqual(['task-due-today-late', 'rem-rem-later-today'])
  })

  it('lifts a task flagged urgent above later, unflagged work', () => {
    expect(ids.indexOf('task-high-undated')).toBeLessThan(ids.indexOf('task-med-tomorrow'))
    expect(ids.indexOf('task-high-next-week')).toBeLessThan(ids.indexOf('task-med-tomorrow'))
  })

  it('does NOT lift an urgent task above something due today', () => {
    /* "Urgent" is a label someone attached; a deadline today is a fact. */
    expect(ids.indexOf('task-due-today-late')).toBeLessThan(ids.indexOf('task-high-next-week'))
  })

  it('leaves the undated, unflagged task last', () => {
    expect(ids[ids.length - 1]).toBe('task-low-undated')
  })

  it('produces the full expected order', () => {
    expect(ids).toEqual([
      'task-overdue-days',      // deadline passed, days ago
      'rem-rem-yesterday',      // reminder from yesterday, never ticked
      'rem-rem-earlier-today',  // reminder at 09:00, read at 14:00
      'task-overdue-hours',     // deadline passed, this morning
      'task-due-today-late',    // today 18:00, still to come
      'rem-rem-later-today',    // today 20:00, still to come
      'task-high-next-week',    // urgent with a deadline
      'task-high-undated',      // urgent without one
      'task-med-tomorrow',      // the rest, soonest first — 22nd…
      'rem-rem-next-week',      // …then the 27th, kind is irrelevant here
      'task-low-undated',       // nothing to date it by, so it sits last
    ])
  })
})

describe('tasksAndReminders — what each row carries', () => {
  it('a task row carries the raw task, which toggleTask() needs', () => {
    const t = find('task-due-today-late')
    expect(t.task).toBeTruthy()
    expect(t.task.id).toBe('due-today-late')
    expect(t.priority).toBe('low')
    expect(t.when).toBeTruthy()
  })

  it('a reminder row carries the real id, which completeReminder() needs', () => {
    /* `id` is the prefixed React key; acting on it needs the raw id. */
    const r = find('rem-rem-later-today')
    expect(r.reminderId).toBe('rem-later-today')
    expect(r.title).toBe('לאסוף חבילה')
  })

  it('an undated task carries a null `when` so the row renders no date', () => {
    expect(find('task-low-undated').when).toBeNull()
  })
})

describe('tasksAndReminders — edges', () => {
  it('honours the limit, 0 meaning no limit', () => {
    expect(tasksAndReminders(3, { tasks, reminders }, now)).toHaveLength(3)
    expect(tasksAndReminders(0, { tasks, reminders }, now).length).toBe(items.length)
  })

  it('treats an unparseable due_at as undated rather than throwing', () => {
    const odd = [{ id: 'bad', priority: 'low', status: 'todo', due_at: 'not-a-date' }]
    const out = tasksAndReminders(0, { tasks: odd }, now)
    expect(out.map((i) => i.id)).toEqual(['task-bad'])
    expect(out[0].bucket).toBe('undated')
  })

  it('survives an empty or absent data bag', () => {
    expect(tasksAndReminders(0, {}, now)).toEqual([])
    expect(() => tasksAndReminders()).not.toThrow()
  })
})
