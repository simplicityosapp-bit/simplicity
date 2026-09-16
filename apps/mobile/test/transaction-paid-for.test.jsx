/* ════════════════════════════════════════════════════════════════
   "עבור מה?" — which of a client's tracks a payment was for
   ════════════════════════════════════════════════════════════════
   The phone's transaction form never asked, so a mixed client's payment
   could not say whether it paid for the group or the personal series.
   Pinned: the field shows only for income from a client with more than
   one track; the choice is written as group_id; another client or an
   expense drops it.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))
jest.mock('../src/lib/formOptions', () => ({ useFormOptions: () => ({ clients: [], categories: [], projects: [], groups: [] }) }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import AddTransactionModal from '../src/modals/AddTransactionModal'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const clients = [
  { id: 'c1', name: 'נופר', price_per_session: 200 },
  { id: 'c2', name: 'רעות' },
]
const groups = [{ id: 'g1', name: 'בוקר' }]
const members = [{ id: 'm1', client_id: 'c1', group_id: 'g1' }]
const wrap = (props) => render(
  <SafeAreaProvider initialMetrics={METRICS}>
    <AddTransactionModal open onClose={jest.fn()} clients={clients} members={members} groups={groups} {...props} />
  </SafeAreaProvider>,
)
const T = (k) => i18n.t(`modalsData:${k}`)

describe('paid for', () => {
  it('asks for a client with a group and a personal series, and writes the choice', async () => {
    const onSave = jest.fn(async () => {})
    wrap({ onSave, defaults: { client_id: 'c1', type: 'income' } })
    expect(screen.getByText(T('tx.paidFor'))).toBeTruthy()
    fireEvent.press(screen.getByText(T('tx.paidForPersonal')))
    fireEvent.press(screen.getByText('בוקר'))
    fireEvent.changeText(screen.getByLabelText(T('common.amount')), '400')
    await act(async () => { fireEvent.press(screen.getByText(T('common.save'))) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'c1', group_id: 'g1', type: 'income' }))
  })

  it('is not asked for a client with one track', () => {
    wrap({ onSave: jest.fn(), defaults: { client_id: 'c2', type: 'income' } })
    expect(screen.queryByText(T('tx.paidFor'))).toBeNull()
  })

  it('an expense is never for a track, even when edited from one', async () => {
    const onSave = jest.fn(async () => {})
    const tx = { id: 't1', type: 'income', amount: 400, date: '2026-09-01', client_id: 'c1', group_id: 'g1', status: 'confirmed' }
    wrap({ onSave, tx })
    fireEvent.press(screen.getByText(T('common.expense')))
    await act(async () => { fireEvent.press(screen.getByText(T('common.save'))) })
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'expense', group_id: null }))
  })
})
