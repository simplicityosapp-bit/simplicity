/* ════════════════════════════════════════════════════════════════
   "LEAVE WITHOUT SAVING?" ON THE PHONE'S FORMS
   ════════════════════════════════════════════════════════════════
   The backdrop, the X, cancel and Android's back button all reach a
   sheet's one onClose, and on the phone only the client edit form asked
   before throwing a draft away. Web guards every add/edit form. This pins
   the port (lib/discardGuard) through one of the forms that got it:

     · an untouched form closes at once — including one the caller
       pre-filled, because a seeded client is not the user's work;
     · a touched form asks, and only "leave" actually closes.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { Alert } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

jest.mock('../src/lib/supabase', () => ({ supabase: {} }))
jest.mock('../src/lib/formOptions', () => ({ useFormOptions: () => ({ clients: [], categories: [], projects: [] }) }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import { isDirty } from '../src/lib/discardGuard'
import AddTransactionModal from '../src/modals/AddTransactionModal'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const renderTx = (props = {}) => {
  const onClose = jest.fn()
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AddTransactionModal open onClose={onClose} onSave={jest.fn()} {...props} />
    </SafeAreaProvider>,
  )
  return onClose
}
const cancel = () => fireEvent.press(screen.getByText(i18n.t('modalsData:common.cancel')))

let alert
beforeEach(() => { alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {}) })
afterEach(() => { alert.mockRestore() })

describe('isDirty', () => {
  it('reads empty values alike and honours skipped fields', () => {
    expect(isDirty({ a: '', b: null }, { a: undefined, b: '' })).toBe(false)
    expect(isDirty({ a: 5 }, { a: '5' })).toBe(false)
    expect(isDirty({ a: 'x', d: '2026-01-01' }, { a: 'x', d: '2026-01-02' }, ['d'])).toBe(false)
    expect(isDirty({ a: 'y' }, { a: 'x' })).toBe(true)
  })
})

describe('a guarded form', () => {
  it('closes at once when untouched', () => {
    const onClose = renderTx()
    cancel()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(alert).not.toHaveBeenCalled()
  })

  it('does not count what the caller pre-filled as the user\'s work', () => {
    const onClose = renderTx({ defaults: { client_id: 'c1', amount: '200' } })
    cancel()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(alert).not.toHaveBeenCalled()
  })

  it('asks before dropping a change, and only "leave" closes', () => {
    const onClose = renderTx()
    fireEvent.press(screen.getByText(i18n.t('modalsData:common.expense')))
    cancel()
    expect(onClose).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledTimes(1)
    const [title, , buttons] = alert.mock.calls[0]
    expect(title).toBe(i18n.t('modalsSystem:discard.title'))
    buttons.find((b) => b.style === 'cancel').onPress?.()
    expect(onClose).not.toHaveBeenCalled()
    buttons.find((b) => b.style === 'destructive').onPress()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
