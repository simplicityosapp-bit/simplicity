/* ════════════════════════════════════════════════════════════════
   THE INVESTMENT ROW on the phone's finance screen
   ════════════════════════════════════════════════════════════════
   Pinned: the resting line quotes the same target web computes; "השקעתי"
   writes the expense and its record; removing a record asks, then takes
   its expense with it; the reminder is bound to the investment and
   pre-worded. And the reminder sheet no longer strips a non-client link
   when such a reminder is edited on the phone.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

let mockInvestments = []
const mockWrites = []
jest.mock('../src/lib/supabase', () => {
  const from = (table) => {
    const q = {
      _table: table,
      select: () => q, eq: () => q, is: () => q, order: async () => ({ data: table === 'investments' ? mockInvestments : [], error: null }),
      update: (patch) => { mockWrites.push({ table, op: 'update', patch }); return { eq: async (col, val) => { mockWrites.at(-1).id = val; return { error: null } } } },
      insert: (row) => { mockWrites.push({ table, op: 'insert', row }); return { select: () => ({ single: async () => ({ data: { id: `${table}-new`, ...row }, error: null }) }) } },
    }
    return q
  }
  return { supabase: { from, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } } }
})
const mockPrefs = { prefs: { investment: { base: 'income', percent: 10, view: 'monthly' } }, update: jest.fn(async () => {}) }
jest.mock('../src/hooks/usePreferences', () => ({ usePreferences: () => mockPrefs }))
jest.mock('../src/lib/preferences', () => ({ usePreferences: () => mockPrefs }))
jest.mock('../src/lib/formOptions', () => ({ useFormOptions: () => ({ clients: [], taskCategories: [] }) }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import InvestmentRow from '../src/screens/finance/InvestmentRow'
import AddReminderModal from '../src/modals/AddReminderModal'
import { dismiss as dismissUndo } from '../src/lib/undo'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const I = (k, o) => i18n.t(`finance:investment.${k}`, o)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const now = new Date()
const month = new Date(now.getFullYear(), now.getMonth(), 1)
const day2 = ymd(new Date(now.getFullYear(), now.getMonth(), 2))
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const mount = (props = {}) => {
  const fns = {
    addCategory: jest.fn(async (name, color) => ({ id: 'cat-new', name, color })),
    addTransaction: jest.fn(async (row) => ({ id: 'tx-new', ...row })),
    deleteTransaction: jest.fn(async () => {}),
    restoreTransaction: jest.fn(async () => {}),
  }
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <InvestmentRow month={month} transactions={[{ id: 't1', type: 'income', amount: 8000, date: day2, status: 'confirmed' }, { id: 'inv-tx', type: 'expense', amount: 300, date: day2, status: 'confirmed' }]} loading={false} categories={[]} {...fns} {...props} />
    </SafeAreaProvider>,
  )
  return fns
}

jest.setTimeout(20000)
beforeEach(() => { mockInvestments = []; mockWrites.length = 0; mockPrefs.update.mockClear() })
afterEach(() => { jest.restoreAllMocks(); dismissUndo() })

describe('investment row', () => {
  it('quotes 10% of the month income on its resting line', async () => {
    mount()
    await flush()
    expect(screen.getByText('₪800')).toBeTruthy()
  })

  it('"השקעתי" writes the expense under the investments category and links the record', async () => {
    const fns = mount()
    await flush()
    fireEvent.press(screen.getByText(I('title')))
    await act(async () => { fireEvent.press(screen.getByText(`${I('didInvest')} ₪800`)) })
    expect(fns.addCategory).toHaveBeenCalledWith(I('categoryName'), '#8855cc')
    expect(fns.addTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 800, type: 'expense', category_id: 'cat-new', desc: I('txDesc') }))
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'investments', op: 'insert', row: expect.objectContaining({ amount: 800, transaction_id: 'tx-new', user_id: 'u1' }) }))
  })

  it('removing a record asks first, then takes its expense with it', async () => {
    mockInvestments = [{ id: 'i1', amount: 300, invested_on: day2, transaction_id: 'inv-tx' }]
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const fns = mount()
    await flush()
    fireEvent.press(screen.getByText(I('title')))
    fireEvent.press(screen.getByText(I('historyTitle')))
    fireEvent.press(screen.getByLabelText(I('deleteAria')))
    expect(fns.deleteTransaction).not.toHaveBeenCalled()
    await act(async () => { alert.mock.calls[0][2][1].onPress() })
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'investments', op: 'update', id: 'i1' }))
    expect(fns.deleteTransaction).toHaveBeenCalledWith('inv-tx')
  })

  it('the percentage can be typed exactly', async () => {
    mount()
    await flush()
    fireEvent.press(screen.getByText(I('title')))
    fireEvent.press(screen.getByText('10%'))
    const input = screen.getByDisplayValue('10')
    fireEvent.changeText(input, '17.5')
    await act(async () => { fireEvent(input, 'submitEditing') })
    expect(mockPrefs.update).toHaveBeenCalledWith({ investment: { base: 'income', percent: 17.5, view: 'monthly' } })
  })

  it('the reminder is bound to the investment and pre-worded', async () => {
    mount()
    await flush()
    fireEvent.press(screen.getByText(I('title')))
    fireEvent.press(screen.getByText(I('remindMe')))
    expect(screen.getByDisplayValue(I('reminderTitle', { percent: 10 }))).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getAllByText(i18n.t('modalsTask:common.save')).at(-1)) })
    expect(mockWrites).toContainEqual(expect.objectContaining({ table: 'reminders', op: 'insert', row: expect.objectContaining({ linked_to_type: 'investment', linked_to_id: null }) }))
  })
})

describe('reminder sheet', () => {
  it('keeps a non-client link when such a reminder is edited', async () => {
    const onSave = jest.fn(async () => {})
    const reminder = { id: 'r1', title: 'להשקיע', scheduled_at: new Date(Date.now() + 86400000).toISOString(), recurrence_type: 'none', linked_to_type: 'investment', linked_to_id: null }
    render(<SafeAreaProvider initialMetrics={METRICS}><AddReminderModal open reminder={reminder} onClose={jest.fn()} onSave={onSave} /></SafeAreaProvider>)
    expect(screen.queryByText(i18n.t('modalsTask:reminder.linkedClient'))).toBeNull()
    await act(async () => { fireEvent.press(screen.getAllByText(i18n.t('modalsTask:common.save')).at(-1)) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ linked_to_type: 'investment' }))
  })
})
