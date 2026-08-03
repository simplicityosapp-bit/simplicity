/* ════════════════════════════════════════════════════════════════
   ALL-DAY EVENTS HAVE A DATE, AND NO CLOCK.

   An all-day event's start_time is a storage artefact — the sync
   writes the day with whatever time came with it — and the app's
   formatter would happily print that as an hour. Two opposite bugs
   came out of the same fact: the agenda row threw the whole date away
   and said only "כל היום", while the event modal kept the date AND
   printed the meaningless time beside the words saying there wasn't
   one.

   Multi-day spans are pinned too. They became visible on every day
   they cover, so a label naming only the first day would describe
   less than the calendar draws — and Google's exclusive end must not
   push the range a day past where the event actually stops.

   NOTE the assertions avoid the words "היום" / "מחר". i18n is
   initialised by the app, not by a unit test importing core directly,
   so the relative branch has no word to return here. What IS testable
   without it — and what actually matters — is that the date-only
   formatter never emits a clock, and that formatWhen stays exactly
   its date half plus the time.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Jerusalem'

import { describe, it, expect } from 'vitest'
import { formatDay, formatDaySpan, formatWhen } from '@simplicity/core'

const d = (s) => new Date(s)
/* A fixed "now" so today/tomorrow are decided by the test, not the clock. */
const NOW = d('2026-08-10T09:00:00')

describe('formatDay — the date without a clock', () => {
  it('never emits a time, whatever hour is stored', () => {
    for (const iso of ['2026-08-12T00:00:00', '2026-08-12T17:35:00', '2026-08-12T23:59:00']) {
      expect(formatDay(d(iso), NOW)).toBe('12/08')
    }
  })
  it('is the same label for a day regardless of the hour on it', () => {
    expect(formatDay(d('2026-08-10T00:00:00'), NOW)).toBe(formatDay(d('2026-08-10T23:59:00'), NOW))
    expect(formatDay(d('2026-08-11T00:00:00'), NOW)).toBe(formatDay(d('2026-08-11T23:59:00'), NOW))
  })
  it('carries no colon — the defect being fixed was a stray hour', () => {
    expect(formatDay(d('2026-08-12T17:35:00'), NOW)).not.toContain(':')
  })
})

describe('formatWhen is unchanged by the refactor', () => {
  it('stays its own date half plus the time', () => {
    const at = d('2026-08-12T10:00:00')
    expect(formatWhen(at, NOW)).toBe(`${formatDay(at, NOW)} · 10:00`)
  })
  it('keeps the dot separator on an absolute date', () => {
    expect(formatWhen(d('2026-08-12T10:00:00'), NOW)).toBe('12/08 · 10:00')
  })
})

describe('formatDaySpan — one day or a range', () => {
  it('treats an end inside the same day as one day', () => {
    expect(formatDaySpan({ when: d('2026-08-12T00:00:00'), end: d('2026-08-13T00:00:00') }, NOW))
      .toBe('12/08')
  })
  it('spans a real range, honouring the exclusive end', () => {
    /* 12–14 August is stored with an end of the 15th at midnight. */
    expect(formatDaySpan({ when: d('2026-08-12T00:00:00'), end: d('2026-08-15T00:00:00') }, NOW))
      .toBe('12/08–14/08')
  })
  it('uses plain dates at BOTH ends, never mixing in a relative word', () => {
    const label = formatDaySpan({ when: d('2026-08-10T00:00:00'), end: d('2026-08-15T00:00:00') }, NOW)
    expect(label).toBe('10/08–14/08')
  })
  it('falls back to the single day when the end precedes the start', () => {
    expect(formatDaySpan({ when: d('2026-08-12T00:00:00'), end: d('2026-08-11T00:00:00') }, NOW))
      .toBe('12/08')
  })
  it('falls back to the single day with no end at all', () => {
    expect(formatDaySpan({ when: d('2026-08-12T00:00:00') }, NOW)).toBe('12/08')
  })
  it('never emits a time for a range either', () => {
    expect(formatDaySpan({ when: d('2026-08-12T17:35:00'), end: d('2026-08-15T09:00:00') }, NOW))
      .not.toContain(':')
  })
})
