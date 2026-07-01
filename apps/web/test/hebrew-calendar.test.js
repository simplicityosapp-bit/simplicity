/* ════════════════════════════════════════════════════════════════
   HEBREW CALENDAR — display-only re-labelling of civil dates.
   Anchored to known Hebrew dates (Rosh Hashana 5786, a leap-year Adar)
   and verified against the platform Intl calendar. Pinned to
   Asia/Jerusalem so the noon-read can't drift on the CI runner's zone.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Jerusalem'

import { describe, it, expect } from 'vitest'
import {
  hebrewNumeral, hebrewParts, hebrewDayNum, isSameHebrewMonth,
  startOfHebrewMonth, stepHebrewMonth, stepHebrewYear, hebrewMonthGrid, hebrewMonthLabel, fmtHebrewDayLabel,
} from '../src/lib/calendar'

describe('hebrewNumeral — gematria with geresh / gershayim', () => {
  it('single letter gets a geresh', () => {
    expect(hebrewNumeral(1)).toBe('א׳')
    expect(hebrewNumeral(9)).toBe('ט׳')
    expect(hebrewNumeral(30)).toBe('ל׳')
  })
  it('multi-letter gets gershayim before the last letter', () => {
    expect(hebrewNumeral(23)).toBe('כ״ג')
  })
  it('15 and 16 are spelled ט״ו / ט״ז, never יה / יו', () => {
    expect(hebrewNumeral(15)).toBe('ט״ו')
    expect(hebrewNumeral(16)).toBe('ט״ז')
  })
  it('renders a year without the 5000s (5786 → תשפ״ו)', () => {
    expect(hebrewNumeral(5786)).toBe('תשפ״ו')
  })
})

describe('hebrewParts — civil date → Hebrew date', () => {
  it('9 Tammuz 5786 = 2026-06-24', () => {
    const p = hebrewParts(new Date(2026, 5, 24))
    expect(p.day).toBe(9)
    expect(p.dayText).toBe('ט׳')
    expect(p.month).toBe('תמוז')
    expect(p.year).toBe(5786)
    expect(p.yearText).toBe('תשפ״ו')
  })
  it('1 Tishrei 5786 (Rosh Hashana) = 2025-09-23', () => {
    const p = hebrewParts(new Date(2025, 8, 23))
    expect(p.day).toBe(1)
    expect(p.month).toBe('תשרי')
    expect(p.year).toBe(5786)
  })
  it('handles a leap year — Adar II, not plain Adar', () => {
    const p = hebrewParts(new Date(2024, 2, 15))
    expect(p.month).toBe('אדר ב׳')
    expect(p.day).toBe(5)
  })
  it('hebrewDayNum is the gematria day', () => {
    expect(hebrewDayNum(new Date(2026, 5, 24))).toBe('ט׳')
  })
})

describe('startOfHebrewMonth — first civil day of the Hebrew month', () => {
  it('Tammuz 5786 begins 2026-06-16', () => {
    const s = startOfHebrewMonth(new Date(2026, 5, 24))
    expect(s.getFullYear()).toBe(2026)
    expect(s.getMonth()).toBe(5)
    expect(s.getDate()).toBe(16)
    expect(hebrewParts(s).day).toBe(1)
  })
  it('is idempotent — running it on the 1st returns the same day', () => {
    const s = startOfHebrewMonth(new Date(2026, 5, 24))
    expect(startOfHebrewMonth(s).getTime()).toBe(s.getTime())
  })
})

describe('stepHebrewMonth — month navigation', () => {
  const tammuz = new Date(2026, 5, 24)
  it('steps back to Sivan', () => {
    expect(hebrewMonthLabel(stepHebrewMonth(tammuz, -1))).toBe('סיוון תשפ״ו')
  })
  it('steps forward to Av', () => {
    expect(hebrewMonthLabel(stepHebrewMonth(tammuz, +1))).toBe('אב תשפ״ו')
  })
  it('round-trips forward then back to the same month', () => {
    const fwdBack = stepHebrewMonth(stepHebrewMonth(tammuz, +1), -1)
    expect(isSameHebrewMonth(fwdBack, tammuz)).toBe(true)
  })
})

describe('stepHebrewYear — whole-year navigation', () => {
  const tammuz = new Date(2026, 5, 24) // Tammuz 5786
  it('forward keeps the month name and advances the year', () => {
    const next = stepHebrewYear(tammuz, +1)
    expect(hebrewParts(next).month).toBe('תמוז')
    expect(hebrewParts(next).year).toBe(5787)
  })
  it('backward keeps the month name and decrements the year', () => {
    const prev = stepHebrewYear(tammuz, -1)
    expect(hebrewParts(prev).month).toBe('תמוז')
    expect(hebrewParts(prev).year).toBe(5785)
  })
  it('lands on day 1 of the target month', () => {
    expect(hebrewParts(stepHebrewYear(tammuz, +1)).day).toBe(1)
  })

  /* The Adar edge — the only month that differs between common and leap
     years. Anchors: 2024-03-15 = אדר ב׳ 5784 (leap), 2025-03-15 = אדר 5785. */
  it('leaving a leap year maps אדר ב׳ → the lone אדר', () => {
    const adarII = new Date(2024, 2, 15) // אדר ב׳ 5784
    const next = stepHebrewYear(adarII, +1)
    expect(hebrewParts(next).month).toBe('אדר')
    expect(hebrewParts(next).year).toBe(5785)
  })
  it('entering a leap year maps the lone אדר → אדר ב׳ (festive Adar)', () => {
    const adar = new Date(2025, 2, 15) // אדר 5785
    const prev = stepHebrewYear(adar, -1)
    expect(hebrewParts(prev).month).toBe('אדר ב׳')
    expect(hebrewParts(prev).year).toBe(5784)
  })
  it('round-trips an Adar jump across the leap boundary', () => {
    const adarII = new Date(2024, 2, 15)
    const there = stepHebrewYear(adarII, +1)        // → אדר 5785
    const back = stepHebrewYear(there, -1)          // → אדר ב׳ 5784
    expect(isSameHebrewMonth(back, adarII)).toBe(true)
  })
})

describe('hebrewMonthGrid — 42-cell grid', () => {
  it('always returns 42 cells starting on the week-start', () => {
    const grid = hebrewMonthGrid(new Date(2026, 5, 24), 'sunday')
    expect(grid).toHaveLength(42)
    expect(grid[0].getDay()).toBe(0) // Sunday
  })
  it('respects a Monday week-start', () => {
    const grid = hebrewMonthGrid(new Date(2026, 5, 24), 'monday')
    expect(grid[0].getDay()).toBe(1)
  })
  it('contains the whole Hebrew month', () => {
    const ref = new Date(2026, 5, 24)
    const inMonth = hebrewMonthGrid(ref).filter((d) => isSameHebrewMonth(d, ref))
    // Hebrew months are 29 or 30 days — every day is present in the grid.
    expect(inMonth.length).toBeGreaterThanOrEqual(29)
    expect(inMonth.length).toBeLessThanOrEqual(30)
  })
})

describe('fmtHebrewDayLabel — full day-view label', () => {
  it('reads "יום <weekday> · <day> ב<month> <year>"', () => {
    expect(fmtHebrewDayLabel(new Date(2026, 5, 24))).toBe('יום רביעי · ט׳ בתמוז תשפ״ו')
  })
})
