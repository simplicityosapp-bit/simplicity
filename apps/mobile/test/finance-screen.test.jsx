/* ════════════════════════════════════════════════════════════════
   THE MONEY SCREEN — search, approve-all, the receipt on WhatsApp
   ════════════════════════════════════════════════════════════════
   Pinned:
     · a typed search reaches back past the month on screen, hides the
       month's sections, and offers the way back;
     · a type chip alone only narrows the month;
     · "approve all" states the count and both totals before approving;
     · an issued receipt goes out over WhatsApp with its link.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert, Linking } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})
jest.mock('../src/lib/supabase', () => ({ supabase: {} }))
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {}, useNavigation: () => ({ navigate: jest.fn() }) }))
jest.mock('../src/components/Generators', () => ({ __esModule: true, default: () => null, generateNow: jest.fn() }))
jest.mock('../src/lib/generators', () => ({ onGenerated: () => () => {} }))
jest.mock('../src/screens/finance/FinanceChart', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/AddTransactionModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/FinanceCategoriesModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/modals/RecurringModal', () => ({ __esModule: true, default: () => null }))
jest.mock('../src/hooks/useRecurring', () => ({ useRecurring: () => ({ templates: [], addRecurring: jest.fn(), updateRecurring: jest.fn(), removeRecurring: jest.fn() }) }))
jest.mock('../src/lib/formOptions', () => ({ useFormOptions: () => ({ projects: [], refetch: jest.fn() }) }))
const mockPrefs = { prefs: {}, update: jest.fn() }
jest.mock('../src/hooks/usePreferences', () => ({ usePreferences: () => mockPrefs }))
jest.mock('../src/lib/preferences', () => ({ usePreferences: () => mockPrefs }))

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const thisMonth = ymd(new Date(now.getFullYear(), now.getMonth(), 2))
const longAgo = ymd(new Date(now.getFullYear(), now.getMonth() - 3, 10))
const mockSetStatus = jest.fn(async () => {})
const mockData = {
  transactions: [
    { id: 't1', type: 'income', desc: 'פגישה', amount: 300, date: thisMonth, status: 'confirmed', client_id: 'c1', invoice_document_url: 'https://docs/r1', invoice_document_number: '1001' },
    { id: 't2', type: 'income', desc: 'סדנה בחיפה', amount: 1200, date: longAgo, status: 'confirmed' },
    { id: 't3', type: 'income', desc: 'תשלום רותם', amount: 500, date: thisMonth, status: 'pending' },
    { id: 't4', type: 'expense', desc: 'שכירות חדר', amount: 200, date: thisMonth, status: 'pending' },
  ],
  clients: [{ id: 'c1', name: 'דנה', phone: '050-1234567' }],
  categories: [], members: [], groups: [], goals: [], goalCategories: [],
  loading: false, error: null, refetch: jest.fn(),
  addTransaction: jest.fn(), updateTransaction: jest.fn(), deleteTransaction: jest.fn(), restoreTransaction: jest.fn(),
  setStatus: mockSetStatus, addCategory: jest.fn(), removeCategory: jest.fn(), loadMeetings: jest.fn(),
}
jest.mock('../src/hooks/useFinanceData', () => ({ useFinanceData: () => mockData }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import { isr } from '@simplicity/core'
import FinanceScreen from '../src/screens/FinanceScreen'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderFinance = () => render(<SafeAreaProvider initialMetrics={METRICS}><FinanceScreen /></SafeAreaProvider>)

beforeEach(() => { mockSetStatus.mockClear() })

describe('money search', () => {
  it('finds a transaction from another month and leaves month view', () => {
    renderFinance()
    expect(screen.queryByText('סדנה בחיפה')).toBeNull()
    fireEvent.changeText(screen.getByLabelText(i18n.t('finance:search.ariaLabel')), 'חיפה')
    expect(screen.getByText('סדנה בחיפה')).toBeTruthy()
    expect(screen.getByText(i18n.t('finance:search.resultsAcrossTime', { count: 1 }))).toBeTruthy()
    expect(screen.queryByText(i18n.t('finance:pending.count', { count: 2 }))).toBeNull()
  })

  it('a type chip alone narrows the month only', () => {
    renderFinance()
    // The summary card says "הוצאות" too; the chip row renders above it.
    fireEvent.press(screen.getAllByText(i18n.t('finance:search.typeExpense'))[0])
    expect(screen.queryByText('פגישה')).toBeNull()
    expect(screen.queryByText('סדנה בחיפה')).toBeNull()
  })
})

describe('approve all', () => {
  it('states the count and both totals, then approves each', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    renderFinance()
    fireEvent.press(screen.getByText(i18n.t('finance:pending.approveAll')))
    expect(mockSetStatus).not.toHaveBeenCalled()
    const [title, message, buttons] = alert.mock.calls[0]
    expect(title).toBe(i18n.t('finance:pending.approveAllConfirm.title'))
    expect(message).toContain(isr(500))
    expect(message).toContain(isr(200))
    await act(async () => { await buttons.find((b) => b.style !== 'cancel').onPress() })
    expect(mockSetStatus.mock.calls.map((c) => c[0]).sort()).toEqual(['t3', 't4'])
    alert.mockRestore()
  })
})

describe('receipt', () => {
  it('sends an issued receipt over WhatsApp with its link', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue()
    renderFinance()
    fireEvent.press(screen.getByLabelText(i18n.t('finance:tx.sendReceipt', { defaultValue: 'WhatsApp' })))
    const url = decodeURIComponent(open.mock.calls[0][0])
    expect(url).toContain('972501234567')
    expect(url).toContain('https://docs/r1')
    open.mockRestore()
  })
})
