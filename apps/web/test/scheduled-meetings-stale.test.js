/* ════════════════════════════════════════════════════════════════
   staleScheduledMeetingIds — must decide "does this meeting belong to
   that recurring slot?" in the COACH'S zone, not the runtime's.

   Run under UTC on purpose. Reading the slot with getDay/getHours (as
   it used to) makes a 19:45 Israel meeting look like a 16:45 one from
   anywhere else, so a slot change would either spare occurrences it
   should have dropped or drop ones it should have kept.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { staleScheduledMeetingIds } from '../src/lib/scheduledMeetings'

const now = new Date('2026-07-20T05:00:00Z')
/* Wednesdays 19:45 Israel = 16:45Z in summer. */
const meetings = [
  { id: 'future-a', subject_type: 'client', subject_id: 'c1', status: 'pending', scheduled_at: '2026-07-22T16:45:00.000Z' },
  { id: 'future-b', subject_type: 'client', subject_id: 'c1', status: 'pending', scheduled_at: '2026-07-29T16:45:00.000Z' },
  { id: 'past', subject_type: 'client', subject_id: 'c1', status: 'pending', scheduled_at: '2026-07-15T16:45:00.000Z' },
  { id: 'confirmed', subject_type: 'client', subject_id: 'c1', status: 'confirmed', scheduled_at: '2026-08-05T16:45:00.000Z' },
  { id: 'one-off', subject_type: 'client', subject_id: 'c1', status: 'pending', scheduled_at: '2026-07-23T09:00:00.000Z' },
  { id: 'other-subject', subject_type: 'client', subject_id: 'c2', status: 'pending', scheduled_at: '2026-07-22T16:45:00.000Z' },
]
const WED_1945 = { day: 3, time: '19:45' }

describe('staleScheduledMeetingIds — runtime timezone independence', () => {
  it('matches the old slot by Israeli wall-clock while running under UTC', () => {
    expect(new Date().getTimezoneOffset()).toBe(0)          // sanity: really on UTC
    const stale = staleScheduledMeetingIds('client', 'c1', WED_1945, { day: 1, time: '10:00' }, meetings, now)
    expect(stale.sort()).toEqual(['future-a', 'future-b'])
  })

  it('keeps past, confirmed, one-off and other subjects', () => {
    const stale = staleScheduledMeetingIds('client', 'c1', WED_1945, { day: 1, time: '10:00' }, meetings, now)
    for (const id of ['past', 'confirmed', 'one-off', 'other-subject']) expect(stale).not.toContain(id)
  })

  it('drops every future occurrence when the slot is cleared', () => {
    const stale = staleScheduledMeetingIds('client', 'c1', WED_1945, { day: null, time: null }, meetings, now)
    expect(stale.sort()).toEqual(['future-a', 'future-b'])
  })

  it('spares occurrences the new slot still covers', () => {
    const stale = staleScheduledMeetingIds('client', 'c1', WED_1945, WED_1945, meetings, now)
    expect(stale).toEqual([])
  })

  it('does not treat the naive UTC reading as the slot', () => {
    /* 16:45 is what a UTC runtime sees; it is NOT the coach's slot, so
       nothing should match it. The old implementation matched here. */
    const stale = staleScheduledMeetingIds('client', 'c1', { day: 3, time: '16:45' }, { day: 1, time: '10:00' }, meetings, now)
    expect(stale).toEqual([])
  })
})
