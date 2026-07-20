/* ════════════════════════════════════════════════════════════════
   CALENDAR DUPLICATES — detection + near-exact classification.
   ════════════════════════════════════════════════════════════════
   findCalendarDuplicates pairs an app meeting with a synced Google event
   for the same subject/day within DUP_WINDOW_MIN (90). isNearExactDuplicate
   marks the tight subset (±AUTO_RESOLVE_WINDOW_MIN = 15) that the calendar
   screen auto-hides; looser pairs stay manual. */
import { describe, it, expect } from 'vitest'
import {
  findCalendarDuplicates,
  isNearExactDuplicate,
  DUP_WINDOW_MIN,
  AUTO_RESOLVE_WINDOW_MIN,
} from '@simplicity/core'

const clients = [{ id: 'c1', name: 'דנה' }]
const meeting = (id, at) => ({ id, status: 'confirmed', subject_type: 'client', subject_id: 'c1', scheduled_at: at })
const event = (id, at, extra = {}) => ({ id, start_time: at, client_id: 'c1', deleted_at: null, owned: false, title: 'דנה', ...extra })

describe('findCalendarDuplicates', () => {
  it('pairs an app meeting with a same-subject event within the 90-min window', () => {
    const dups = findCalendarDuplicates({
      meetings: [meeting('m1', '2026-07-20T10:00:00')],
      calendarEvents: [event('e1', '2026-07-20T10:05:00')],
      clients,
    })
    expect(dups).toHaveLength(1)
    expect(dups[0].meeting.id).toBe('m1')
    expect(dups[0].event.id).toBe('e1')
  })

  it('does not pair across different calendar days', () => {
    const dups = findCalendarDuplicates({
      meetings: [meeting('m1', '2026-07-20T10:00:00')],
      calendarEvents: [event('e1', '2026-07-21T10:00:00')],
      clients,
    })
    expect(dups).toHaveLength(0)
  })

  it('ignores events beyond the 90-min window on the same day', () => {
    const dups = findCalendarDuplicates({
      meetings: [meeting('m1', '2026-07-20T10:00:00')],
      calendarEvents: [event('e1', '2026-07-20T13:00:00')], // +180 min
      clients,
    })
    expect(dups).toHaveLength(0)
  })
})

describe('isNearExactDuplicate — the ±15-min auto-hide gate', () => {
  it('is true when the two sides start within AUTO_RESOLVE_WINDOW_MIN', () => {
    const [dup] = findCalendarDuplicates({
      meetings: [meeting('m1', '2026-07-20T10:00:00')],
      calendarEvents: [event('e1', '2026-07-20T10:10:00')], // +10 min
      clients,
    })
    expect(isNearExactDuplicate(dup)).toBe(true)
  })

  it('is false for a loose pair still inside the 90-min detection window', () => {
    const [dup] = findCalendarDuplicates({
      meetings: [meeting('m1', '2026-07-20T10:00:00')],
      calendarEvents: [event('e1', '2026-07-20T11:00:00')], // +60 min → manual only
      clients,
    })
    expect(dup).toBeDefined()
    expect(isNearExactDuplicate(dup)).toBe(false)
  })

  it('is false exactly one minute past the window, true at the boundary', () => {
    const at = '2026-07-20T10:00:00'
    const boundary = findCalendarDuplicates({ meetings: [meeting('m1', at)], calendarEvents: [event('e1', '2026-07-20T10:15:00')], clients })[0]
    const past = findCalendarDuplicates({ meetings: [meeting('m1', at)], calendarEvents: [event('e1', '2026-07-20T10:16:00')], clients })[0]
    expect(isNearExactDuplicate(boundary)).toBe(true)  // exactly +15
    expect(isNearExactDuplicate(past)).toBe(false)     // +16
  })

  it('guards against malformed input', () => {
    expect(isNearExactDuplicate(null)).toBe(false)
    expect(isNearExactDuplicate({ meeting: {}, event: {} })).toBe(false)
  })
})

describe('window constants', () => {
  it('auto-resolve window is well under the detection window', () => {
    expect(AUTO_RESOLVE_WINDOW_MIN).toBe(15)
    expect(DUP_WINDOW_MIN).toBe(90)
    expect(AUTO_RESOLVE_WINDOW_MIN).toBeLessThan(DUP_WINDOW_MIN)
  })
})
