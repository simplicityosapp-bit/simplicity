/* ════════════════════════════════════════════════════════════════
   WHAT STOPS A BOOKING PAGE GOING LIVE.
   ════════════════════════════════════════════════════════════════
   The builder had refused to publish a page whose windows are all shorter than
   the shortest meeting it offers since findUnbookableDay was written — such a
   page goes live offering NOTHING, the visitor meets an empty calendar, and the
   owner never finds out.

   Then the creation wizard arrived with its own publish step and simply never
   asked. Same product, same fault, two answers — because the rule lived inside
   one component instead of beside the data.

   It is one function now, and these are its terms. The point of testing it here
   rather than through either screen is that neither screen can drift from it
   without failing.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { publishBlocker, offeredDurations, publishMessage, EMPTY_WEEKLY } from '../src/lib/bookingPageSchema'

const TYPES = [
  { id: 'a', name: 'ארוכה', duration_minutes: 60 },
  { id: 'b', name: 'קצרה', duration_minutes: 30 },
]
const page = (weekly, extra = {}) => ({
  availability: { weekly, defaultDurationMinutes: 50, slotMinutes: 30 },
  meeting_type_ids: [],
  meeting_type_durations: {},
  ...extra,
})

describe('publishBlocker', () => {
  it('stops a page with no hours at all', () => {
    expect(publishBlocker(page(EMPTY_WEEKLY), TYPES)).toEqual({ code: 'errNoAvailability' })
  })

  it('lets a workable page through', () => {
    const weekly = { ...EMPTY_WEEKLY, 1: [{ start: '09:00', end: '17:00' }] }
    expect(publishBlocker(page(weekly), TYPES)).toBeNull()
  })

  it('THE BUG: stops a day too short for the shortest meeting on offer', () => {
    /* 60-minute meeting, a half-hour window. The page would go live offering
       nothing at all — this is the case the wizard used to publish happily. */
    const weekly = { ...EMPTY_WEEKLY, 1: [{ start: '09:00', end: '09:30' }] }
    const draft = page(weekly, { meeting_type_ids: ['a'] })
    expect(publishBlocker(draft, TYPES)).toEqual({
      code: 'errWindowShorterThanMeeting',
      params: { day: 1, minutes: 60, window: 30 },
    })
  })

  it('measures against the SHORTEST meeting, not the longest', () => {
    /* A 30-minute window fits the short meeting, so the day still produces
       slots and the page is publishable. */
    const weekly = { ...EMPTY_WEEKLY, 1: [{ start: '09:00', end: '09:30' }] }
    const draft = page(weekly, { meeting_type_ids: ['a', 'b'] })
    expect(publishBlocker(draft, TYPES)).toBeNull()
  })

  it('respects a per-page length override', () => {
    /* The type says 30, this page says 90 — the window no longer fits. */
    const weekly = { ...EMPTY_WEEKLY, 1: [{ start: '09:00', end: '10:00' }] }
    const draft = page(weekly, { meeting_type_ids: ['b'], meeting_type_durations: { b: 90 } })
    expect(publishBlocker(draft, TYPES)?.code).toBe('errWindowShorterThanMeeting')
  })

  it('falls back to the page default when no type is picked', () => {
    const weekly = { ...EMPTY_WEEKLY, 1: [{ start: '09:00', end: '09:40' }] }
    expect(publishBlocker(page(weekly), TYPES)?.params.minutes, 'the synthetic meeting').toBe(50)
  })

  it('leaves a closed day alone — not working Fridays is a choice', () => {
    const weekly = { ...EMPTY_WEEKLY, 1: [{ start: '09:00', end: '17:00' }], 5: [] }
    expect(publishBlocker(page(weekly, { meeting_type_ids: ['a'] }), TYPES)).toBeNull()
  })

  it('accepts a day where only ONE window is long enough', () => {
    const weekly = { ...EMPTY_WEEKLY, 1: [{ start: '09:00', end: '09:15' }, { start: '11:00', end: '13:00' }] }
    expect(publishBlocker(page(weekly, { meeting_type_ids: ['a'] }), TYPES)).toBeNull()
  })
})

describe('offeredDurations', () => {
  it('is a single synthetic meeting when nothing is picked', () => {
    expect(offeredDurations(page(EMPTY_WEEKLY), TYPES)).toEqual([50])
  })

  it('takes each type’s own length', () => {
    expect(offeredDurations(page(EMPTY_WEEKLY, { meeting_type_ids: ['a', 'b'] }), TYPES)).toEqual([60, 30])
  })

  it('lets the per-page override win', () => {
    const draft = page(EMPTY_WEEKLY, { meeting_type_ids: ['a'], meeting_type_durations: { a: 25 } })
    expect(offeredDurations(draft, TYPES)).toEqual([25])
  })

  it('falls back to the page default for a type with no length', () => {
    const draft = page(EMPTY_WEEKLY, { meeting_type_ids: ['c'] })
    expect(offeredDurations(draft, [{ id: 'c', name: 'ללא' }])).toEqual([50])
  })
})

describe('publishMessage', () => {
  const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)

  it('says nothing when there is nothing to say', () => {
    expect(publishMessage(null, t)).toBeNull()
  })

  it('names the no-hours case', () => {
    expect(publishMessage({ code: 'errNoAvailability' }, t)).toBe('pages.errNoAvailability')
  })

  it('turns the weekday INDEX into a label and keeps the numbers', () => {
    const msg = publishMessage(
      { code: 'errWindowShorterThanMeeting', params: { day: 1, minutes: 60, window: 30 } }, t,
    )
    expect(msg).toContain('pages.errWindowShorterThanMeeting')
    expect(msg).toContain('"minutes":60')
    expect(msg).toContain('"window":30')
    expect(msg, 'day must arrive as a name, never the raw index').not.toContain('"day":1')
  })
})
