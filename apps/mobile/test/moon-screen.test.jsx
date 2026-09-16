/* ════════════════════════════════════════════════════════════════
   THE MOON SCREEN — recorded days, per-goal rows, the folded analysis
   ════════════════════════════════════════════════════════════════
   Pinned: today's score is recorded once the read settles (and not after a
   failed one), without touching the reflection column; each goal has its
   own row, a manual one with "+" that logs for that goal; the correlation
   section stays folded — and uncomputed — until opened; the overlay's
   metric choice is saved to preferences; the reports link goes to Reports.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockTables = {}
const mockWrites = []
let mockFail = false
jest.mock('../src/lib/supabase', () => {
  const from = (table) => {
    const q = {
      select: () => q, is: () => q, gte: () => q, lte: () => q,
      order: async () => ({ data: mockTables[table] || [], error: null }),
      range: async () => (mockFail && table === 'goals' ? { data: null, error: { message: 'offline' } } : { data: mockTables[table] || [], error: null }),
      upsert: async (row, opts) => { mockWrites.push({ table, op: 'upsert', row, opts }); return { error: null } },
      insert: (row) => ({ select: () => ({ single: async () => { mockWrites.push({ table, op: 'insert', row }); return { data: { id: `${table}-new`, ...row }, error: null } } }) }),
    }
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } } }
})
const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {}, useNavigation: () => ({ navigate: mockNavigate }) }))
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
const mockPrefs = { prefs: { design: {} }, update: jest.fn(async () => {}) }
jest.mock('../src/hooks/usePreferences', () => ({ usePreferences: () => mockPrefs }))
jest.mock('../src/lib/preferences', () => ({ usePreferences: () => mockPrefs }))
const mockCorrelations = jest.fn(() => [])
jest.mock('@simplicity/core', () => ({ ...jest.requireActual('@simplicity/core'), buildOverviewCorrelations: (...a) => mockCorrelations(...a) }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import MoonScreen from '../src/screens/MoonScreen'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const M = (k, o) => i18n.t(`moon:${k}`, o)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const seed = () => {
  mockTables.goal_categories = [{ id: 'cat', key: 'other', name: 'אישי', measurement_type: 'manual', color: '#7a5cb8' }]
  mockTables.goals = [
    { id: 'g1', category_id: 'cat', label: 'ריצה', time_frame: 'monthly', target_value: 10, importance: 3, created_at: '2026-01-01T00:00:00Z' },
    { id: 'g2', category_id: 'cat', label: 'קריאה', time_frame: 'monthly', target_value: 5, importance: 3, created_at: '2026-01-01T00:00:00Z' },
  ]
  mockTables.goal_entries = [{ id: 'e1', goal_id: 'g1', category_id: 'cat', value: 5, date: ymd(new Date()) }]
}
const mount = async () => {
  render(<SafeAreaProvider initialMetrics={METRICS}><MoonScreen /></SafeAreaProvider>)
  await flush()
}

jest.setTimeout(20000)
beforeEach(() => {
  for (const k of Object.keys(mockTables)) delete mockTables[k]
  mockWrites.length = 0; mockFail = false; mockCorrelations.mockClear(); mockPrefs.update.mockClear(); mockNavigate.mockClear()
  mockPrefs.prefs = { design: {} }
  seed()
})

describe('moon screen', () => {
  it("records today's score once loaded, leaving the reflection alone", async () => {
    await mount()
    const ups = mockWrites.filter((w) => w.table === 'moon_snapshots')
    expect(ups).toHaveLength(1)
    expect(ups[0].opts).toEqual({ onConflict: 'user_id,date' })
    expect(ups[0].row).toMatchObject({ user_id: 'u1', date: ymd(new Date()) })
    expect(typeof ups[0].row.confidence).toBe('number')
    expect(ups[0].row).not.toHaveProperty('reflection')
  })

  it('records nothing from a failed read', async () => {
    mockFail = true
    await mount()
    expect(mockWrites.filter((w) => w.table === 'moon_snapshots')).toHaveLength(0)
  })

  it('lists each goal with a "+" that logs for that goal', async () => {
    await mount()
    expect(screen.getByText('ריצה')).toBeTruthy()
    fireEvent.press(screen.getByLabelText(M('logEntryAria', { name: 'קריאה' })))
    fireEvent.changeText(screen.getByPlaceholderText('0'), '2')
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsData:common.save'))) })
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'goal_entries', op: 'insert', row: expect.objectContaining({ goal_id: 'g2', value: 2 }) }))
  })

  it('keeps the correlations folded and uncomputed until opened', async () => {
    await mount()
    expect(screen.queryByText(M('section.correlations'), { exact: true })).toBeNull()
    expect(mockCorrelations).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText(M('deeper.title')))
    await waitFor(() => expect(screen.getByText(M('corr.empty'))).toBeTruthy())
    expect(mockCorrelations).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ window: 120 }))
  })

  it('saves the overlay metric choice to preferences', async () => {
    await mount()
    fireEvent.press(screen.getByText(M('deeper.title')))
    await flush()
    fireEvent.press(screen.getByText(M('pills.sessions')))
    const fn = mockPrefs.update.mock.calls.at(-1)[0]
    expect(fn({ moonOverviewKeys: ['income'] })).toEqual({ moonOverviewKeys: ['income', 'sessions'] })
  })

  it('links to reports', async () => {
    await mount()
    fireEvent.press(screen.getByText(M('reports')))
    expect(mockNavigate).toHaveBeenCalledWith('Reports')
  })
})
