/* ════════════════════════════════════════════════════════════════
   THE ADJUSTMENT SHEET — which figure moves, and why
   ════════════════════════════════════════════════════════════════
   Pinned:
     · the reason sheet keeps the delta's sign and saves it against the
       figure its reason belongs to;
     · the edit sheet writes one row per figure that moved — «שולם» with
       the chosen reason, a lower «יתרה» as a discount — and meetings
       straight onto the client;
     · booking the money as income is offered instead of an adjustment.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import AdjustmentModal from '../src/modals/AdjustmentModal'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const t = (k, o) => i18n.t(`clients:${k}`, o)
const wrap = (props) => render(<SafeAreaProvider initialMetrics={METRICS}><AdjustmentModal open onClose={jest.fn()} {...props} /></SafeAreaProvider>)
const balance = { paid: 500, balance: 300, adjustment: 0, memberTotal: 0, personalQuota: 8, personalDone: 3, personalHeld: 3, hasPersonal: true, perSession: false }
const client = { id: 'c1', price_per_session: 100, total_override: null }

describe('reason sheet (opened by an edit of «שולם»/«יתרה»)', () => {
  it('keeps the sign and saves against the reason\'s figure', async () => {
    const onSave = jest.fn(async () => {})
    wrap({ presetAmount: -200, presetReason: 'unrecorded_payment', balance, onSave })
    expect(screen.getByDisplayValue('-200')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByText(t('inline.save'))) })
    expect(onSave).toHaveBeenCalledWith({ kind: 'paid', reason: 'unrecorded_payment', amount: -200, note: null })
  })

  it('a discount is a balance row', async () => {
    const onSave = jest.fn(async () => {})
    wrap({ presetAmount: 50, presetReason: 'unrecorded_payment', balance, onSave })
    fireEvent.press(screen.getByText(t('adjust.reasonDiscount')))
    await act(async () => { fireEvent.press(screen.getByText(t('inline.save'))) })
    expect(onSave).toHaveBeenCalledWith({ kind: 'balance', reason: 'discount', amount: 50, note: null })
  })
})

describe('edit sheet (the «התאמה» link)', () => {
  it('asks for something to change first', async () => {
    const onSave = jest.fn()
    wrap({ presetAmount: null, client, balance, onSave })
    await act(async () => { fireEvent.press(screen.getByText(t('inline.save'))) })
    expect(screen.getByText(t('adjust.nothingChanged'))).toBeTruthy()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('writes a paid row with the chosen reason and meetings onto the client', async () => {
    const onSave = jest.fn(async () => {})
    const onSaveClient = jest.fn(async () => {})
    wrap({ presetAmount: null, client, balance, onSave, onSaveClient })
    fireEvent.changeText(screen.getByLabelText(t('adjust.paid')), '700')
    fireEvent.changeText(screen.getByLabelText(t('adjust.scheduled')), '10')
    fireEvent.press(screen.getByText(t('adjust.reasonImportFix')))
    await act(async () => { fireEvent.press(screen.getByText(t('inline.save'))) })
    expect(onSaveClient).toHaveBeenCalledWith({ sessions: 10 })
    expect(onSave).toHaveBeenCalledWith({ kind: 'paid', reason: 'import_fix', amount: 200, note: null })
  })

  it('a lower balance is a discount of the difference', async () => {
    const onSave = jest.fn(async () => {})
    wrap({ presetAmount: null, client, balance, onSave })
    // 8 × 100 = 800 owed, 500 paid → 300; typing 250 forgives 50.
    fireEvent.changeText(screen.getByLabelText(t('adjust.balance')), '250')
    await act(async () => { fireEvent.press(screen.getByText(t('inline.save'))) })
    expect(onSave).toHaveBeenCalledWith({ kind: 'balance', reason: 'discount', amount: 50, note: null })
  })

  it('offers to book received money as income instead', () => {
    const onAlsoRecordIncome = jest.fn()
    wrap({ presetAmount: null, client, balance, onSave: jest.fn(), onAlsoRecordIncome })
    fireEvent.changeText(screen.getByLabelText(t('adjust.paid')), '600')
    fireEvent.press(screen.getByText(t('adjust.alsoRecordIncome')))
    expect(onAlsoRecordIncome).toHaveBeenCalledWith(100, null)
  })
})
