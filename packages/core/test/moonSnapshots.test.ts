/* The recorded daily score laid over the live trend, and the three figures
   under the chart. Pinned in a zone west of UTC, where reading a DATE string
   as UTC midnight moves every recorded day back by one. */
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import { mergeSnapshotTrend, moonTrendStats, readMoonOverviewKeys, moonDayKey } from '../src'

const day = (d: number) => new Date(2026, 8, d, 0, 0, 0)
const NOW = new Date(2026, 8, 5, 18, 0, 0)
const live = [1, 2, 3, 4, 5].map((d) => ({ date: day(d), score: d === 1 ? null : 50 }))

describe('mergeSnapshotTrend', () => {
  it('lays each recorded day over the estimate, on its own calendar day', () => {
    const merged = mergeSnapshotTrend(live, [{ date: '2026-09-03', confidence: 80 }], NOW)
    expect(merged.map((p) => p.score)).toEqual([null, 50, 80, 50, 50])
  })

  it('never lets an older snapshot of today override the live score', () => {
    const merged = mergeSnapshotTrend(live, [{ date: '2026-09-05', confidence: 10 }], NOW)
    expect(merged[4].score).toBe(50)
  })

  it('falls back to the score when a row has no confidence', () => {
    expect(mergeSnapshotTrend(live, [{ date: '2026-09-02', score: 30 }], NOW)[1].score).toBe(30)
  })

  it('is the live trend when nothing was recorded', () => {
    expect(mergeSnapshotTrend(live, [], NOW)).toBe(live)
  })
})

describe('moonTrendStats', () => {
  it('skips days that were never scored', () => {
    expect(moonTrendStats([{ date: day(1), score: null }, { date: day(2), score: 40 }, { date: day(3), score: 80 }])).toEqual({ avg: 60, peak: 80, today: 80 })
  })

  it('reports nothing rather than zero when nothing was scored', () => {
    expect(moonTrendStats([{ date: day(1), score: null }])).toEqual({ avg: null, peak: null, today: null })
  })
})

describe('readMoonOverviewKeys', () => {
  it('drops metrics that no longer exist and keeps an explicit empty choice', () => {
    expect(readMoonOverviewKeys({ moonOverviewKeys: ['sessions', 'gone'] })).toEqual(['sessions'])
    expect(readMoonOverviewKeys({ moonOverviewKeys: [] })).toEqual([])
    expect(readMoonOverviewKeys({})).toEqual(['income', 'score'])
  })
})

describe('moonDayKey', () => {
  it('reads a DATE string as the local day', () => {
    expect(moonDayKey('2026-09-01')).toBe('2026-09-01')
  })
})
