/* ════════════════════════════════════════════════════════════════
   INVOICE IMPORT QUEUE — documents issued outside the app
   ════════════════════════════════════════════════════════════════
   Approving creates a real income row, so it always asks first, and asks
   louder when the same client already has an income of that amount. A row
   already handled on another device is simply dropped. Dismissing is one tap.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Alert } from 'react-native'

const mockInvoke = jest.fn()
let mockRows = []
jest.mock('../src/lib/supabase', () => {
  const chain = { select: () => chain, eq: () => chain, order: async () => ({ data: mockRows, error: null }) }
  return { supabase: { from: () => chain, functions: { invoke: (...a) => mockInvoke(...a) } } }
})

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import InvoiceImports from '../src/screens/finance/InvoiceImports'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const I = (k, o) => i18n.t(`finance:imports.${k}`, o)
const imp = (over = {}) => ({ id: 'i1', status: 'pending', document_type: 'receipt', document_number: '501', amount: 250, customer_name: 'נופר', client_id: 'c1', doc_date: '2026-09-12', ...over })
const mount = (props = {}) => render(
  <SafeAreaProvider initialMetrics={METRICS}><InvoiceImports {...props} /></SafeAreaProvider>,
)
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const httpError = (body) => Object.assign(new Error('non-2xx'), { context: new Response(JSON.stringify(body), { status: 409 }) })

beforeEach(() => { mockInvoke.mockReset(); mockRows = [] })
afterEach(() => { jest.restoreAllMocks() })

describe('the import queue', () => {
  it('renders nothing when nothing is waiting', async () => {
    mount()
    await flush()
    expect(screen.queryByText(I('heading'))).toBeNull()
  })

  it('asks before recording, then records and drops the row', async () => {
    mockRows = [imp()]
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const onImported = jest.fn()
    mount({ onImported })
    fireEvent.press(await screen.findByLabelText(I('importAria')))
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(alert.mock.calls[0][0]).toBe(I('confirmTitle'))
    await act(async () => { alert.mock.calls[0][2][1].onPress() })
    expect(mockInvoke).toHaveBeenCalledWith('invoices', { body: { action: 'import-approve', import_id: 'i1' } })
    expect(onImported).toHaveBeenCalled()
    expect(screen.queryByText(I('heading'))).toBeNull()
  })

  it('warns louder when the client already has an income of that amount', async () => {
    mockRows = [imp()]
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mount({ transactions: [{ id: 't1', type: 'income', client_id: 'c1', amount: 250 }] })
    expect(await screen.findByText(I('possibleDup'))).toBeTruthy()
    fireEvent.press(screen.getByLabelText(I('importAria')))
    expect(alert.mock.calls[0][0]).toBe(I('dupTitle'))
  })

  it('a document already handled elsewhere is dropped, not an error', async () => {
    mockRows = [imp()]
    mockInvoke.mockResolvedValue({ data: null, error: httpError({ error: 'already_handled' }) })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const onImported = jest.fn()
    mount({ onImported })
    fireEvent.press(await screen.findByLabelText(I('importAria')))
    await act(async () => { alert.mock.calls[0][2][1].onPress() })
    expect(screen.queryByText(I('heading'))).toBeNull()
    expect(onImported).toHaveBeenCalled()
  })

  it('dismisses in one tap', async () => {
    mockRows = [imp(), imp({ id: 'i2', document_number: '502' })]
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
    mount()
    const [first] = await screen.findAllByLabelText(I('dismiss'))
    await act(async () => { fireEvent.press(first) })
    expect(mockInvoke).toHaveBeenCalledWith('invoices', { body: { action: 'import-dismiss', import_id: 'i1' } })
    expect(screen.queryByText(/501/)).toBeNull()
    expect(screen.getByText(/502/)).toBeTruthy()
  })
})
