/* ════════════════════════════════════════════════════════════════
   CALENDAR — a multi-day event must appear on EVERY day it spans.

   The bucketing helpers used to match on the start day alone, so a
   three-day conference synced from Google showed up on day one and
   vanished for days two and three, in the day, week and month views
   alike. Two end conventions meet in these helpers and both are
   pinned here:
     • Google stores an all-day event's end as the EXCLUSIVE next
       midnight (28–30 July → end 31 July 00:00), so the 31st must
       NOT light up;
     • a timed event ending exactly at midnight must not bleed into
       the following day either.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Jerusalem'

import { describe, it, expect } from 'vitest'
import { eventsForDay, eventsByDate, lastDayOf, coversDay, dateKey } from '@simplicity/core'

const d = (s) => new Date(s)

/* A 3-day all-day event as the Google sync stores it: 28–30 July, with
   the exclusive end landing on the 31st at midnight. */
const conference = { id: 'conf', when: d('2026-07-28T00:00:00'), end: d('2026-07-31T00:00:00'), allDay: true }
/* An overnight timed event — 23:00 Tuesday to 01:00 Wednesday. */
const overnight = { id: 'night', when: d('2026-07-28T23:00:00'), end: d('2026-07-29T01:00:00') }
/* Ends exactly at midnight — one day only. */
const tillMidnight = { id: 'mid', when: d('2026-07-28T20:00:00'), end: d('2026-07-29T00:00:00') }
/* No end at all (reminders, lead follow-ups) — one day only. */
const pointEvent = { id: 'point', when: d('2026-07-28T09:00:00') }

describe('lastDayOf', () => {
  it('treats an all-day end as exclusive', () => {
    expect(dateKey(lastDayOf(conference))).toBe(dateKey(d('2026-07-30T12:00:00')))
  })
  it('keeps a midnight-ending event on its own day', () => {
    expect(dateKey(lastDayOf(tillMidnight))).toBe(dateKey(d('2026-07-28T12:00:00')))
  })
  it('carries an overnight event into the next day', () => {
    expect(dateKey(lastDayOf(overnight))).toBe(dateKey(d('2026-07-29T12:00:00')))
  })
  it('falls back to the start day with no end', () => {
    expect(dateKey(lastDayOf(pointEvent))).toBe(dateKey(d('2026-07-28T12:00:00')))
  })
  it('ignores an end that precedes the start', () => {
    const broken = { when: d('2026-07-28T10:00:00'), end: d('2026-07-27T10:00:00') }
    expect(dateKey(lastDayOf(broken))).toBe(dateKey(d('2026-07-28T12:00:00')))
  })
})

describe('coversDay', () => {
  it('covers every day of the span, and no day beyond it', () => {
    expect(coversDay(conference, d('2026-07-27T12:00:00'))).toBe(false)
    expect(coversDay(conference, d('2026-07-28T12:00:00'))).toBe(true)
    expect(coversDay(conference, d('2026-07-29T12:00:00'))).toBe(true)  // regression: used to be false
    expect(coversDay(conference, d('2026-07-30T12:00:00'))).toBe(true)  // regression: used to be false
    expect(coversDay(conference, d('2026-07-31T12:00:00'))).toBe(false) // exclusive end
  })
})

describe('eventsForDay', () => {
  const feed = [conference, overnight, tillMidnight, pointEvent]

  it('returns a continuing event on its middle day', () => {
    expect(eventsForDay(feed, d('2026-07-29T12:00:00')).map((e) => e.id)).toEqual(['conf', 'night'])
  })
  it('returns a continuing event on its last day', () => {
    expect(eventsForDay(feed, d('2026-07-30T12:00:00')).map((e) => e.id)).toEqual(['conf'])
  })
  it('returns nothing the day after an exclusive end', () => {
    expect(eventsForDay(feed, d('2026-07-31T12:00:00'))).toEqual([])
  })
  it('sorts by start time, so a carried-over event leads the day', () => {
    expect(eventsForDay(feed, d('2026-07-28T12:00:00')).map((e) => e.id))
      .toEqual(['conf', 'point', 'mid', 'night'])
  })
})

describe('eventsByDate', () => {
  const map = eventsByDate([conference, overnight, pointEvent])

  it('buckets a multi-day event under every day it spans', () => {
    expect(map.get(dateKey(d('2026-07-28T00:00:00'))).map((e) => e.id)).toEqual(['conf', 'night', 'point'])
    expect(map.get(dateKey(d('2026-07-29T00:00:00'))).map((e) => e.id)).toEqual(['conf', 'night'])
    expect(map.get(dateKey(d('2026-07-30T00:00:00'))).map((e) => e.id)).toEqual(['conf'])
  })
  it('leaves the day after an exclusive end empty', () => {
    expect(map.get(dateKey(d('2026-07-31T00:00:00')))).toBeUndefined()
  })
  it('caps a corrupt far-future end instead of spinning', () => {
    const corrupt = { id: 'bad', when: d('2026-07-28T00:00:00'), end: d('2999-01-01T00:00:00') }
    const big = eventsByDate([corrupt])
    expect(big.size).toBeLessThanOrEqual(367)
  })
})
