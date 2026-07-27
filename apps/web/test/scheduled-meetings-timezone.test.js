/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS — the engine must produce Israeli wall-clock
   times even when the RUNTIME is not in Israel.

   This is the guard for the nightly cron. The Supabase Edge runtime is
   pinned to UTC and refuses TZ changes (Deno.env.set('TZ') throws
   NotSupported), so an engine that used setHours would have written a
   09:30 slot as 09:30Z — 12:30 in Israel. Every other meetings test
   pins TZ to Asia/Jerusalem and therefore cannot catch that; this file
   deliberately runs under UTC.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { generateScheduledMeetings } from '../src/lib/scheduledMeetings'

/* Wall-clock reading of an instant in a given zone, as "HH:mm". */
const hhmmIn = (iso, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso))
const weekdayIn = (iso, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(new Date(iso))

const group = (over = {}) => ({
  id: 'g1',
  status: 'active',
  recurring_day: 3,             // Wednesday
  recurring_time: '09:30',
  created_at: '2026-06-23T13:41:13.000Z',
  ...over,
})

describe('generateScheduledMeetings — runtime timezone independence', () => {
  it('puts a 09:30 slot at 09:30 Israel time while running under UTC', () => {
    expect(new Date().getTimezoneOffset()).toBe(0)      // sanity: we really are on UTC
    const now = new Date('2026-07-15T05:00:00Z')
    const rows = generateScheduledMeetings([], [group()], [], now, { weeksAhead: 3, pastLookbackDays: 0 })

    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(hhmmIn(r.scheduled_at, 'Asia/Jerusalem')).toBe('09:30')
      expect(weekdayIn(r.scheduled_at, 'Asia/Jerusalem')).toBe('Wed')
    }
    /* The bug this guards: naive setHours under UTC would have produced
       09:30Z, which Israel reads as 12:30. */
    expect(rows.some((r) => hhmmIn(r.scheduled_at, 'UTC') === '09:30')).toBe(false)
  })

  it('holds the wall-clock minute across the autumn DST change, under UTC', () => {
    /* Israel leaves DST on 2026-10-25, so the UTC offset moves +3 → +2.
       A fixed-offset engine would drift the meeting by an hour. */
    const now = new Date('2026-10-14T05:00:00Z')
    const rows = generateScheduledMeetings([], [group()], [], now, { weeksAhead: 4, pastLookbackDays: 0 })

    const utcHours = new Set(rows.map((r) => hhmmIn(r.scheduled_at, 'UTC')))
    expect(utcHours.size).toBeGreaterThan(1)            // the UTC reading genuinely shifts…
    for (const r of rows) {
      expect(hhmmIn(r.scheduled_at, 'Asia/Jerusalem')).toBe('09:30')   // …the Israeli one does not
    }
  })

  it('honours an explicit timeZone override', () => {
    const now = new Date('2026-07-15T05:00:00Z')
    const rows = generateScheduledMeetings([], [group()], [], now, {
      weeksAhead: 2, pastLookbackDays: 0, timeZone: 'Europe/London',
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(hhmmIn(r.scheduled_at, 'Europe/London')).toBe('09:30')
  })

  it('clamps to the series dates by the COACH\'S calendar day, not the runtime\'s', () => {
    /* recurring_end_date 2026-07-22: the 22/07 occurrence is inside the
       series and must survive; the 29/07 one must not. */
    const now = new Date('2026-07-15T05:00:00Z')
    const rows = generateScheduledMeetings([], [group({ recurring_end_date: '2026-07-22' })], [], now, {
      weeksAhead: 4, pastLookbackDays: 0,
    })
    const days = rows.map((r) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric' }).format(new Date(r.scheduled_at)))
    expect(days).toContain('22')
    expect(days).not.toContain('29')
  })
})
