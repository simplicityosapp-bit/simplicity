/* ════════════════════════════════════════════════════════════════
   THE REPORTS SCREEN — saved layout, change, drill-down, export
   ════════════════════════════════════════════════════════════════
   Pinned: a metric hidden in the saved layout (web's prefs.reports) stays
   hidden here; a figure shows its change from last month; tapping it lists
   the rows behind it, each opening where it lives on the phone; the
   customize sheet edits the same saved layout; export shares the month.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Share } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {}, useNavigation: () => ({ navigate: mockNavigate }) }))
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/lib/supabase', () => ({ supabase: {} }))
const mockPrefs = { prefs: {}, update: jest.fn(async () => {}) }
jest.mock('../src/hooks/usePreferences', () => ({ usePreferences: () => mockPrefs }))
jest.mock('../src/lib/preferences', () => ({ usePreferences: () => mockPrefs }))
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mockNow = new Date()
const mockData = {
  // No tally ledger: counts come from the rows themselves.
  leads: [], sessions: [], tasks: [], groupMembers: [], groups: [], tallies: null,
  clients: [{ id: 'c1', name: 'נופר', created_at: new Date(mockNow.getFullYear(), mockNow.getMonth(), 2).toISOString() }],
  transactions: [
    { id: 't1', type: 'income', amount: 1000, status: 'confirmed', date: ymd(new Date(mockNow.getFullYear(), mockNow.getMonth(), 1)), client_id: 'c1', desc: 'אימון' },
    { id: 't0', type: 'income', amount: 400, status: 'confirmed', date: ymd(new Date(mockNow.getFullYear(), mockNow.getMonth() - 1, 10)), client_id: 'c1', desc: 'אימון' },
  ],
  loading: false, error: null, refetch: jest.fn(),
}
jest.mock('../src/hooks/useReportsData', () => ({ useReportsData: () => mockData }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import { REPORT_METRICS } from '@simplicity/core'
import ReportsScreen from '../src/screens/ReportsScreen'
import { drillTarget } from '../src/modals/ReportDrillSheet'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const R = (k, o) => i18n.t(`reports:${k}`, o)
const mount = () => render(<SafeAreaProvider initialMetrics={METRICS}><ReportsScreen /></SafeAreaProvider>)

jest.setTimeout(20000)
beforeEach(() => { mockPrefs.prefs = {}; mockPrefs.update.mockClear(); mockNavigate.mockClear() })
afterEach(() => { jest.restoreAllMocks() })

describe('reports screen', () => {
  it('keeps a metric hidden in the saved layout hidden', () => {
    // A saved order names every metric; one missing from it counts as new, and new metrics show.
    mockPrefs.prefs = { reports: { visibleMetrics: ['income'], metricOrder: REPORT_METRICS.map((m) => m.id) } }
    mount()
    expect(screen.getByText(R('metrics.income'))).toBeTruthy()
    expect(screen.queryByText(R('metrics.expense'))).toBeNull()
    expect(screen.getByLabelText(R('customize.labelHidden', { shown: 1, total: 13 }))).toBeTruthy()
  })

  it("shows a figure's change from the month before", () => {
    mount()
    // income and net both rose by 600
    expect(screen.getAllByText('+₪600')).toHaveLength(2)
  })

  it('opens the rows behind a figure, and a row opens its client', () => {
    mount()
    fireEvent.press(screen.getByText(R('metrics.newClients')))
    expect(screen.getByText(R('drill.count', { count: 1 }))).toBeTruthy()
    fireEvent.press(screen.getByText('נופר'))
    expect(mockNavigate).toHaveBeenCalledWith('Main', { screen: 'Clients', params: { openClientId: 'c1' } })
  })

  it('edits the same saved layout from the customize sheet', () => {
    mount()
    fireEvent.press(screen.getByLabelText(R('customize.label')))
    fireEvent.press(screen.getByLabelText(R('customize.hide', { label: R('metrics.income') })))
    const edit = mockPrefs.update.mock.calls.at(-1)[0]
    expect(edit({}).reports.visibleMetrics).not.toContain('income')
  })

  it('shares the month as a spreadsheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({})
    mount()
    await act(async () => { fireEvent.press(screen.getByLabelText(R('exportAria'))) })
    const csv = share.mock.calls[0][0].message
    expect(csv.split('\n')[0]).toContain(R('exportHeaders.metric'))
    expect(csv).toContain(`"${R('metrics.income')}","1000.00","600.00"`)
  })
})

describe('drillTarget', () => {
  it('maps web paths to where they live on the phone', () => {
    expect(drillTarget('/clients/abc')).toEqual({ name: 'Main', params: { screen: 'Clients', params: { openClientId: 'abc' } } })
    expect(drillTarget('/leads')).toEqual({ name: 'Leads' })
    expect(drillTarget('/finance')).toEqual({ name: 'Main', params: { screen: 'Finance' } })
    expect(drillTarget('/trash')).toEqual({ name: 'Trash' })
    expect(drillTarget('/nowhere')).toBeNull()
  })
})
