/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS — generation must read the EFFECTIVE client
   status, not the raw `status_meta` column.

   A group-driven client keeps whatever `status_meta` last held while
   effectiveClientMeta reads them as 'past' once every group they
   belong to has ended. Reading the column meant the engine kept
   materialising a weekly meeting forever for a client the rest of
   the app already shows as finished.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Jerusalem'

import { describe, it, expect } from 'vitest'
import { generateScheduledMeetings } from '../src/lib/scheduledMeetings'

const now = new Date(2026, 2, 20, 8, 0, 0) // Fri 2026-03-20 08:00 local
const opts = { weeksAhead: 2, pastLookbackDays: 0 }
const client = {
  id: 'c1',
  recurring_day: 5,
  recurring_time: '10:00',
  status_meta: 'active',   // stale column — the group is what decides
  created_at: '2026-03-01T00:00:00.000Z',
}
const membership = [{ client_id: 'c1', group_id: 'g1' }]

describe('generateScheduledMeetings — effective status', () => {
  it('stops generating for a client whose only group has ended', () => {
    const groups = [{ id: 'g1', status: 'ended' }]
    const rows = generateScheduledMeetings([client], groups, [], now, { ...opts, members: membership })
    expect(rows).toEqual([])
  })

  it('keeps generating while a group is still running', () => {
    const groups = [{ id: 'g1', status: 'active' }]
    const rows = generateScheduledMeetings([client], groups, [], now, { ...opts, members: membership })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('honours a manual override over the group', () => {
    const groups = [{ id: 'g1', status: 'ended' }]
    const overridden = { ...client, status_overridden: true }
    const rows = generateScheduledMeetings([overridden], groups, [], now, { ...opts, members: membership })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('leaves an ungrouped client on their own column', () => {
    const past = { ...client, status_meta: 'past' }
    expect(generateScheduledMeetings([past], [], [], now, opts)).toEqual([])
    expect(generateScheduledMeetings([client], [], [], now, opts).length).toBeGreaterThan(0)
  })
})
