/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS — the series' own recurring_start_date /
   recurring_end_date bound the run.

   Both columns exist on clients AND groups and every add/edit form
   collects them, but the engine used to read neither: it backfilled
   from created_at (so a series starting next month already had
   meetings this month) and ran to the rolling horizon forever (so an
   end date never ended anything).
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Jerusalem'

import { describe, it, expect } from 'vitest'
import { generateScheduledMeetings } from '../src/lib/scheduledMeetings'

/* Wed 2026-07-15 08:00 local. Wednesdays around it: 07-01, 07-08, 07-15,
   07-22, 07-29, 08-05, 08-12. */
const now = new Date(2026, 6, 15, 8, 0, 0)
const opts = { weeksAhead: 4, pastLookbackDays: 14 }
const group = {
  id: 'g1',
  status: 'active',
  recurring_day: 3,
  recurring_time: '09:30',
  created_at: '2026-06-23T13:41:13.000Z',
}
const days = (rows) => rows.map((r) => new Date(r.scheduled_at).getDate())

describe('generateScheduledMeetings — series start/end dates', () => {
  it('does not materialise anything before recurring_start_date', () => {
    const rows = generateScheduledMeetings([], [{ ...group, recurring_start_date: '2026-07-15' }], [], now, opts)
    const earliest = rows.map((r) => new Date(r.scheduled_at)).sort((a, b) => a - b)[0]
    expect(earliest.getTime()).toBeGreaterThanOrEqual(new Date(2026, 6, 15).getTime())
    /* Without the bound, created_at (23/06) + the 14-day lookback would have
       pulled in the 01/07 and 08/07 occurrences. */
    expect(days(rows)).not.toContain(1)
    expect(days(rows)).not.toContain(8)
  })

  it('stops at recurring_end_date — including a meeting ON the closing day', () => {
    const rows = generateScheduledMeetings([], [{ ...group, recurring_end_date: '2026-07-29' }], [], now, opts)
    expect(days(rows)).toContain(29)          // the closing day itself still counts
    expect(days(rows)).not.toContain(5)       // 05/08 is past the end date
    expect(days(rows)).not.toContain(12)
  })

  it('generates nothing once the end date has passed', () => {
    const rows = generateScheduledMeetings([], [{ ...group, recurring_end_date: '2026-06-30' }], [], now, opts)
    expect(rows).toEqual([])
  })

  it('applies the same bounds to a client', () => {
    const client = {
      id: 'c1',
      status_meta: 'active',
      recurring_day: 3,
      recurring_time: '19:45',
      created_at: '2026-06-22T12:20:34.000Z',
      recurring_end_date: '2026-07-22',
    }
    const rows = generateScheduledMeetings([client], [], [], now, opts)
    expect(days(rows)).toContain(22)
    expect(days(rows)).not.toContain(29)
  })

  it('is unchanged when neither date is set', () => {
    const rows = generateScheduledMeetings([], [group], [], now, opts)
    /* The full unbounded run: back to the 14-day lookback and out to the
       4-week horizon (05/08 is the last Wednesday whose 09:30 still falls
       before now+28d, which lands at 08:00 on 12/08). */
    expect(days(rows)).toEqual([1, 8, 15, 22, 29, 5])
  })
})
