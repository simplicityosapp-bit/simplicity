/* ════════════════════════════════════════════════════════════════
   THE PREVIEW MUST NOT PROMISE TIMES THE PAGE CANNOT OFFER.
   ════════════════════════════════════════════════════════════════
   The builder's canvas never showed the slot picker, so the only way to learn
   what a page offered was to publish it and open the link. previewDayTimes
   answers that in the builder — and because it is a SECOND implementation of a
   question the edge function also answers, the rule it encodes has to be the
   edge's: a start time exists only where the whole meeting fits inside one
   window (`start + duration <= windowEnd`), stepping by slotMinutes.

   It deliberately knows nothing about which times are already booked; the
   preview says as much on screen. What it must never do is invent a start the
   edge would refuse.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { previewDayTimes } from '../src/lib/bookingPageSchema'

const av = (weekly, extra = {}) => ({ weekly, slotMinutes: 30, ...extra })

describe('previewDayTimes', () => {
  it('steps by slotMinutes and stops where the meeting no longer fits', () => {
    const times = previewDayTimes(av({ 0: [{ start: '09:00', end: '11:00' }] }), 60, 0)
    expect(times).toEqual(['09:00', '09:30', '10:00'])
  })

  it('offers nothing when the window is shorter than the meeting', () => {
    expect(previewDayTimes(av({ 0: [{ start: '09:00', end: '09:30' }] }), 60, 0)).toEqual([])
  })

  it('offers exactly one start when the window fits the meeting precisely', () => {
    expect(previewDayTimes(av({ 3: [{ start: '14:00', end: '15:00' }] }), 60, 3)).toEqual(['14:00'])
  })

  it('merges several windows on one day, in order and without duplicates', () => {
    const weekly = { 1: [{ start: '09:00', end: '10:00' }, { start: '09:30', end: '11:00' }] }
    expect(previewDayTimes(av(weekly), 30, 1)).toEqual(['09:00', '09:30', '10:00', '10:30'])
  })

  it('honours the page slot interval', () => {
    const weekly = { 2: [{ start: '09:00', end: '10:00' }] }
    expect(previewDayTimes(av(weekly, { slotMinutes: 15 }), 30, 2)).toEqual(['09:00', '09:15', '09:30'])
  })

  it('reads a weekday key whether it is a number or a string', () => {
    expect(previewDayTimes(av({ '4': [{ start: '08:00', end: '09:00' }] }), 60, 4)).toEqual(['08:00'])
  })

  it('says nothing for a closed day, a reversed window or a missing duration', () => {
    expect(previewDayTimes(av({ 5: [] }), 60, 5)).toEqual([])
    expect(previewDayTimes(av({ 5: [{ start: '17:00', end: '09:00' }] }), 60, 5)).toEqual([])
    expect(previewDayTimes(av({ 5: [{ start: '09:00', end: '17:00' }] }), 0, 5)).toEqual([])
  })

  it('falls back to the default interval when slotMinutes is nonsense', () => {
    const weekly = { 6: [{ start: '09:00', end: '10:30' }] }
    expect(previewDayTimes({ weekly, slotMinutes: 0 }, 30, 6)).toEqual(['09:00', '09:30', '10:00'])
  })

  it('survives a missing availability object', () => {
    expect(previewDayTimes(undefined, 60, 0)).toEqual([])
    expect(previewDayTimes({}, 60, 0)).toEqual([])
  })
})
