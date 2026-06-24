/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS — weekly generation must NOT drift across DST.
   Pinned to Asia/Jerusalem (the app's only timezone) so the spring-
   forward boundary is exercised regardless of the CI runner's zone.
   MUST set TZ before importing anything that touches Date.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Jerusalem'

import { describe, it, expect } from 'vitest'
import { generateScheduledMeetings } from '../src/lib/scheduledMeetings'

/* Local hour in Israel for an ISO instant — independent of the process TZ. */
const ilHour = (iso) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date(iso))

describe('generateScheduledMeetings — weekly DST stability', () => {
  it('keeps a 10:00 weekly meeting at 10:00 across the spring-forward (2026-03-27)', () => {
    // A Friday (dow 5) 10:00 client; generate across the late-March DST boundary.
    const client = { id: 'c1', recurring_day: 5, recurring_time: '10:00', status_meta: 'active', created_at: '2026-03-01T00:00:00.000Z' }
    const now = new Date(2026, 2, 20, 8, 0, 0) // Fri 2026-03-20 08:00 local, before the boundary
    const rows = generateScheduledMeetings([client], [], [], now, { weeksAhead: 5, pastLookbackDays: 0 })

    expect(rows.length).toBeGreaterThanOrEqual(4)
    // Sanity — TZ pinning is in effect (first occurrence is 10:00 Israel time).
    expect(ilHour(rows[0].scheduled_at)).toBe('10')
    // At least one occurrence is genuinely past the spring-forward.
    expect(rows.some((r) => new Date(r.scheduled_at) >= new Date('2026-03-27T00:00:00+03:00'))).toBe(true)
    // EVERY occurrence — before and after DST — stays at 10:00 local (no 1h drift).
    for (const r of rows) expect(ilHour(r.scheduled_at)).toBe('10')
  })
})
