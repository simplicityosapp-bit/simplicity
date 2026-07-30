/* ════════════════════════════════════════════════════════════════
   A PUBLISHED BOOKING PAGE HAS TO OFFER SOMETHING.
   ════════════════════════════════════════════════════════════════
   booking-intake only offers a start time when the whole meeting fits inside
   one availability window (`min + duration <= windowEnd`). So a 09:00–09:30
   window against a 60-minute meeting produces nothing — and nothing said so:
   the page published, the visitor met an empty calendar, and the owner had no
   way to know. findUnbookableDay is what the builder now checks before it lets
   a page go live.

   The rules it encodes, each asserted below:
     • a day is unbookable only when EVERY window on it is too short
     • a closed day is a choice, not a fault
     • exact fit is bookable (<= , not <)
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { findUnbookableDay } from '../src/lib/bookingPageSchema'

const av = (weekly) => ({ weekly })

describe('findUnbookableDay', () => {
  it('flags a day whose only window is shorter than the meeting', () => {
    const hit = findUnbookableDay(av({ 0: [{ start: '09:00', end: '09:30' }] }), 60)
    expect(hit).toEqual({ day: 0, longest: 30 })
  })

  it('lets the day pass when one of its windows is long enough', () => {
    const weekly = { 2: [{ start: '09:00', end: '09:30' }, { start: '14:00', end: '16:00' }] }
    expect(findUnbookableDay(av(weekly), 60)).toBeNull()
  })

  it('treats an exact fit as bookable', () => {
    expect(findUnbookableDay(av({ 1: [{ start: '09:00', end: '10:00' }] }), 60)).toBeNull()
  })

  it('ignores days with no windows — a closed day is deliberate', () => {
    const weekly = { 0: [], 5: [{ start: '09:00', end: '17:00' }] }
    expect(findUnbookableDay(av(weekly), 60)).toBeNull()
  })

  it('reports the first offending day, so the message can name one', () => {
    const weekly = {
      1: [{ start: '09:00', end: '17:00' }],
      3: [{ start: '10:00', end: '10:20' }],
      4: [{ start: '10:00', end: '10:15' }],
    }
    expect(findUnbookableDay(av(weekly), 30)).toEqual({ day: 3, longest: 20 })
  })

  it('says nothing when the duration is missing or nonsensical', () => {
    const weekly = { 0: [{ start: '09:00', end: '09:05' }] }
    for (const bad of [0, -30, NaN, undefined, null]) {
      expect(findUnbookableDay(av(weekly), bad)).toBeNull()
    }
  })

  it('survives an empty or absent availability', () => {
    expect(findUnbookableDay(undefined, 60)).toBeNull()
    expect(findUnbookableDay({}, 60)).toBeNull()
    expect(findUnbookableDay(av({}), 60)).toBeNull()
  })
})
