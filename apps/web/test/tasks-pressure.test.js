/* ════════════════════════════════════════════════════════════════
   TASKS PRESSURE SUITE — the mixed "הכל" list's ranking
   (screens/tasks/pressure.js).

   The screen used to rank this list purely by the calendar, with urgency
   demoted to a tie-break INSIDE whatever bucket the date had already
   chosen. Three things followed, and each has a test here:

   1. A task flagged דחוף with no deadline landed in the LAST group — under
      a reminder three weeks out. It now has a band of its own, directly
      below "היום".

   2. A דחוף task due Thursday sat below a trivial one due Monday. It is
      now promoted out of the date band entirely.

   3. The one alternative the screen offered — grouping by priority — had
      the mirror-image hole: only a task carries a priority, so every
      reminder fell into one tail group and an OVERDUE reminder ended up
      below a task marked נמוך. Pressure keeps the clock in charge of the
      top of the list, so that cannot happen.

   And two rules that are easy to "tidy" away later:

   - A reminder is NEVER promoted into "דחוף". It carries no priority, and
     inventing one for it would rank a nudge above work you actually flagged.
     It is read as רגיל when sorting, not as נמוך — a missing flag is not a
     claim that something matters less.

   - The top three bands sort CHRONOLOGICALLY, the bands below them sort by
     urgency first. "באיחור" leads with the oldest debt and "היום" is a day
     plan; both read by the clock. Below דחוף there is nothing on fire and
     the calendar alone was making the call.

   Fixtures use local Date constructors; the code buckets by local parts.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import {
  PRESSURE_BUCKETS,
  CHRONO_PRESSURE,
  dateToBucket,
  pressureBucket,
  byPressure,
  byUrgency,
} from '../src/screens/tasks/pressure'

const now = new Date(2026, 6, 21, 14, 0, 0) // Tue 2026-07-21, 14:00 local
const at = (day, h, m = 0) => new Date(2026, 6, day, h, m, 0).toISOString()

/* The shape the screen builds in allItems. */
const task = (id, priority, when = null) => ({
  key: `task-${id}`, kind: 'task', when, task: { id, priority, title: id },
})
const rem = (id, when) => ({
  key: `rem-${id}`, kind: 'reminder', when, reminder: { id, title: id },
})

/* Build the groups exactly the way the screen's `allGroups` pressure branch
   does, so the ordering assertions below describe the real list. */
function bands(items) {
  return PRESSURE_BUCKETS
    .map((b) => ({
      key: b.key,
      items: items
        .filter((it) => pressureBucket(it, now) === b.key)
        .sort(CHRONO_PRESSURE.has(b.key) ? byPressure : byUrgency),
    }))
    .filter((g) => g.items.length)
}
const idsOf = (band) => band.items.map((it) => (it.task || it.reminder).id)

describe('pressureBucket — which band a row lands in', () => {
  it('puts a דחוף task with NO deadline in "דחוף", not in the undated tail', () => {
    /* The original complaint: it used to be last, under a reminder three
       weeks out. */
    expect(pressureBucket(task('undated-high', 'high'), now)).toBe('urgent')
  })

  it('promotes a דחוף task out of its date band', () => {
    expect(pressureBucket(task('thu-high', 'high', at(23, 9)), now)).toBe('urgent')
    expect(pressureBucket(task('far-high', 'high', at(30, 9)), now)).toBe('urgent')
  })

  it('never promotes a דחוף task past a deadline that has passed or lands today', () => {
    expect(pressureBucket(task('late-high', 'high', at(19, 9)), now)).toBe('overdue')
    expect(pressureBucket(task('today-high', 'high', at(21, 18)), now)).toBe('today')
  })

  it('leaves ordinary dated work in its date band', () => {
    expect(pressureBucket(task('thu-med', 'medium', at(23, 9)), now)).toBe('week')
    expect(pressureBucket(task('far-low', 'low', at(30, 9)), now)).toBe('later')
    expect(pressureBucket(task('undated-med', 'medium'), now)).toBe('undated')
  })

  it('NEVER promotes a reminder into "דחוף" — it carries no priority to promote', () => {
    expect(pressureBucket(rem('r-week', at(23, 9)), now)).toBe('week')
    expect(pressureBucket(rem('r-far', at(30, 9)), now)).toBe('later')
    /* A reminder with no time at all is undated, not urgent. */
    expect(pressureBucket(rem('r-none', null), now)).toBe('undated')
  })

  it('treats a task with no priority set as רגיל, so it is not promoted', () => {
    expect(pressureBucket(task('bare', null, at(23, 9)), now)).toBe('week')
    expect(pressureBucket(task('bare-undated', undefined), now)).toBe('undated')
  })

  it('files an unparsable date as undated rather than crashing or calling it late', () => {
    expect(pressureBucket(task('junk', 'medium', 'not-a-date'), now)).toBe('undated')
    expect(dateToBucket(new Date('nonsense'), now)).toBe(null)
  })
})

describe('the ladder — band order over a mixed list', () => {
  const items = [
    task('undated-low', 'low'),
    task('undated-high', 'high'),
    task('thu-high', 'high', at(23, 9)),
    task('mon-low', 'low', at(27, 9)),
    task('late', 'medium', at(19, 12)),
    task('today-late', 'low', at(21, 18)),
    rem('r-tomorrow', at(22, 9)),
    rem('r-next-week', at(28, 9)),
    rem('r-yesterday', at(20, 9)),
  ]
  const built = bands(items)

  it('orders the bands באיחור → היום → דחוף → השבוע → מאוחר יותר → ללא תאריך', () => {
    expect(built.map((b) => b.key)).toEqual(
      ['overdue', 'today', 'urgent', 'week', 'later', 'undated'],
    )
  })

  it('drops a band with nothing in it rather than printing an empty heading', () => {
    expect(bands([task('only', 'medium', at(23, 9))]).map((b) => b.key)).toEqual(['week'])
  })

  it('puts both דחוף tasks in the דחוף band, dated one first', () => {
    const urgent = built.find((b) => b.key === 'urgent')
    expect(idsOf(urgent)).toEqual(['thu-high', 'undated-high'])
  })

  it('lifts a דחוף task above a reminder that is merely sooner', () => {
    const flat = built.flatMap(idsOf)
    /* This is the whole point: r-tomorrow is due before thu-high, and used to
       sit above it. */
    expect(flat.indexOf('thu-high')).toBeLessThan(flat.indexOf('r-tomorrow'))
    expect(flat.indexOf('undated-high')).toBeLessThan(flat.indexOf('r-next-week'))
  })

  it('still keeps a passed deadline above everything a flag can claim', () => {
    const flat = built.flatMap(idsOf)
    expect(flat.indexOf('late')).toBeLessThan(flat.indexOf('thu-high'))
    expect(flat.indexOf('today-late')).toBeLessThan(flat.indexOf('undated-high'))
    /* And an overdue REMINDER stays above a דחוף task — the hole that grouping
       by priority had. */
    expect(flat.indexOf('r-yesterday')).toBeLessThan(flat.indexOf('thu-high'))
  })
})

describe('ordering inside a band', () => {
  it('sorts באיחור chronologically — the oldest debt leads', () => {
    const items = [
      task('late-hours', 'high', at(21, 10)),
      task('late-days', 'low', at(19, 12)),
    ]
    /* The priority flag does NOT reorder these: a two-day-old deadline leads a
       two-hour-old one even when the newer is the urgent one. */
    expect(idsOf(bands(items).find((b) => b.key === 'overdue')))
      .toEqual(['late-days', 'late-hours'])
  })

  it('sorts היום chronologically — it is a day plan', () => {
    const items = [
      task('t-evening', 'high', at(21, 20)),
      task('t-afternoon', 'low', at(21, 15)),
    ]
    expect(idsOf(bands(items).find((b) => b.key === 'today')))
      .toEqual(['t-afternoon', 't-evening'])
  })

  it('sorts השבוע by urgency first, the date only breaking the tie', () => {
    const items = [
      task('w-low-mon', 'low', at(22, 9)),
      task('w-med-fri', 'medium', at(24, 9)),
      task('w-med-wed', 'medium', at(23, 9)),
    ]
    /* Nothing here is דחוף (that band takes those), so this is רגיל over נמוך
       — and w-low-mon is the soonest of the three, which is what used to put
       it first. */
    expect(idsOf(bands(items).find((b) => b.key === 'week')))
      .toEqual(['w-med-wed', 'w-med-fri', 'w-low-mon'])
  })

  it('reads a reminder as רגיל, so it is not buried under merely-normal work', () => {
    const items = [
      task('w-low', 'low', at(22, 9)),
      rem('w-rem', at(24, 9)),
      task('w-med', 'medium', at(23, 9)),
    ]
    const week = idsOf(bands(items).find((b) => b.key === 'week'))
    expect(week.indexOf('w-rem')).toBeLessThan(week.indexOf('w-low'))
    /* Same rank as the רגיל task, so between those two the date decides. */
    expect(week).toEqual(['w-med', 'w-rem', 'w-low'])
  })

  it('sorts ללא תאריך by urgency, since there is no date to rank by', () => {
    const items = [
      task('u-low', 'low'),
      task('u-med', 'medium'),
      rem('u-rem', null),
    ]
    /* Nothing here has a date, so priority alone ranks it — and between the
       רגיל task and the reminder that reads as רגיל, the task leads. */
    expect(idsOf(bands(items).find((b) => b.key === 'undated')))
      .toEqual(['u-med', 'u-rem', 'u-low'])
  })

  it('breaks a dead-heat with the task, not the reminder — you act on a task', () => {
    const items = [rem('tie-rem', at(23, 9)), task('tie-task', 'medium', at(23, 9))]
    expect(idsOf(bands(items).find((b) => b.key === 'week')))
      .toEqual(['tie-task', 'tie-rem'])
  })
})

describe('the comparators are total and stable', () => {
  const sample = [
    task('a', 'high', at(23, 9)),
    task('b', 'low'),
    rem('c', at(22, 9)),
    task('d', 'medium', at(19, 9)),
  ]
  for (const [name, cmp] of [['byPressure', byPressure], ['byUrgency', byUrgency]]) {
    it(`${name} is antisymmetric and returns 0 on identity`, () => {
      for (const x of sample) {
        expect(cmp(x, x)).toBe(0)
        /* +0 and -0 are distinct to Object.is, so normalise before comparing. */
        for (const y of sample) expect(Math.sign(cmp(x, y)) || 0).toBe(-Math.sign(cmp(y, x)) || 0)
      }
    })
  }
})
