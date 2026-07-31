/* ════════════════════════════════════════════════════════════════
   COPYING A DAY'S HOURS ONTO OTHER DAYS.
   ════════════════════════════════════════════════════════════════
   The coach sets Sunday 09:00–17:00 and wants Monday through Thursday to match.
   The whole feature is one small function, and its one real hazard is sharing:
   if every day points at the SAME window object, editing Monday's start time
   moves Sunday's too — a bug that looks like the app forgetting what it was
   told, and which no amount of careful UI would catch.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { copyDayWindows, describeWindows } from '../src/lib/bookingPageSchema'

const SUNDAY_HOURS = [{ start: '09:00', end: '17:00' }]

describe('copyDayWindows', () => {
  it('puts the source day’s hours on every chosen day', () => {
    const weekly = { 0: SUNDAY_HOURS, 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    const next = copyDayWindows(weekly, 0, [1, 2, 3, 4])
    for (const day of [1, 2, 3, 4]) {
      expect(next[day]).toEqual([{ start: '09:00', end: '17:00' }])
    }
  })

  it('gives each day its own window objects, so editing one cannot move another', () => {
    const weekly = { 0: SUNDAY_HOURS, 1: [] }
    const next = copyDayWindows(weekly, 0, [1])
    next[1][0].start = '11:00'                       // the coach edits Monday
    expect(next[0][0].start, 'Sunday must not have moved').toBe('09:00')
    expect(next[1][0].start).toBe('11:00')
  })

  it('carries every window of a split day, separately cloned', () => {
    const split = [{ start: '09:00', end: '12:00' }, { start: '16:00', end: '19:00' }]
    const next = copyDayWindows({ 0: split, 3: [] }, 0, [3])
    expect(next[3]).toHaveLength(2)
    expect(next[3][1]).toEqual({ start: '16:00', end: '19:00' })
    expect(next[3][1], 'a shared object here is the same bug, one window deeper').not.toBe(split[1])
  })

  it('replaces what the target day already held', () => {
    const weekly = { 0: SUNDAY_HOURS, 2: [{ start: '20:00', end: '22:00' }] }
    const next = copyDayWindows(weekly, 0, [2])
    expect(next[2]).toEqual([{ start: '09:00', end: '17:00' }])
  })

  it('leaves days that were not chosen exactly as they were', () => {
    const tuesday = [{ start: '20:00', end: '22:00' }]
    const weekly = { 0: SUNDAY_HOURS, 1: [], 2: tuesday }
    const next = copyDayWindows(weekly, 0, [1])
    expect(next[2]).toBe(tuesday)
  })

  it('never mutates the weekly map it was given', () => {
    const weekly = { 0: SUNDAY_HOURS, 1: [] }
    const before = JSON.stringify(weekly)
    copyDayWindows(weekly, 0, [1])
    expect(JSON.stringify(weekly)).toBe(before)
  })

  it('ignores the source day appearing in its own target list', () => {
    const next = copyDayWindows({ 0: SUNDAY_HOURS }, 0, [0])
    expect(next[0], 'copying a day onto itself must not empty it').toEqual(SUNDAY_HOURS)
  })

  it('treats string and number day keys as the same day', () => {
    /* weekly survives a JSON round-trip to the database, which turns every key
       into a string — so the source may arrive as '0' and the click as 0. */
    const next = copyDayWindows({ 0: SUNDAY_HOURS }, '0', [1])
    expect(next[1]).toEqual([{ start: '09:00', end: '17:00' }])
  })

  it('survives a missing source or empty selection', () => {
    expect(copyDayWindows({}, 5, [1])[1]).toEqual([])
    expect(() => copyDayWindows(undefined, 0, undefined)).not.toThrow()
  })
})

describe('describeWindows', () => {
  it('reads back one window', () => {
    expect(describeWindows(SUNDAY_HOURS)).toBe('09:00–17:00')
  })

  it('joins a split day in order', () => {
    expect(describeWindows([{ start: '09:00', end: '12:00' }, { start: '16:00', end: '19:00' }]))
      .toBe('09:00–12:00, 16:00–19:00')
  })

  it('says nothing for a closed day — the caller supplies the word', () => {
    expect(describeWindows([])).toBe('')
    expect(describeWindows(undefined)).toBe('')
  })

  it('skips a half-typed window rather than printing a dangling dash', () => {
    expect(describeWindows([{ start: '09:00', end: '' }, { start: '16:00', end: '19:00' }]))
      .toBe('16:00–19:00')
  })
})
