/* ════════════════════════════════════════════════════════════════
   ISSUING INVOICES FROM THE PHONE
   ════════════════════════════════════════════════════════════════
   A real tax document can't be taken back, so what is pinned is mostly
   what the panel refuses to do: issue on a single tap, issue a likely
   duplicate without two explicit confirmations, or offer a plain retry
   after the provider left the outcome unknown (that retry is how a second
   document gets minted). And the happy paths: issue, credit, repair an
   in-doubt issuance, and "issue on save" from the new-payment sheet.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Alert } from 'react-native'

const mockInvoke = jest.fn()
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a) => mockInvoke(...a) },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
  },
}))
jest.mock('../src/lib/formOptions', () => ({ useFormOptions: () => ({ clients: [], categories: [], projects: [], groups: [] }) }))

/* eslint-disable import/first */
import i18n from '../src/lib/i18n'
import { resetInvoiceCache } from '../src/lib/invoices'
import { getSnapshot as getToast, clearToast } from '../src/lib/toast'
import InvoiceActions from '../src/components/InvoiceActions'
import AddTransactionModal from '../src/modals/AddTransactionModal'
/* eslint-enable import/first */

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }
const A = (k, o) => i18n.t(`connections:actions.${k}`, o)
const TX = (k, o) => i18n.t(`modalsData:tx.${k}`, o)

const CONNECTED = { connected: true, business_type: 'licensed' }
/* A fake `invoices` function: status/catalog answer; everything else is
   whatever the test says (default: ok). */
const serve = (handlers = {}) => {
  mockInvoke.mockImplementation(async (_name, { body }) => {
    if (handlers[body.action]) return handlers[body.action](body)
    if (body.action === 'status') return { data: { status: CONNECTED }, error: null }
    if (body.action === 'catalog') return { data: { items: [{ id: 7, name: 'אימון אישי', price: 300 }] }, error: null }
    return { data: {}, error: null }
  })
}
const calls = (action) => mockInvoke.mock.calls.map(([, { body }]) => body).filter((b) => b.action === action)
const httpError = (body) => Object.assign(new Error('non-2xx'), { context: new Response(JSON.stringify(body), { status: 502 }) })

const tx = { id: 't1', type: 'income', amount: 300, date: '2026-09-10', client_id: 'c1', desc: 'אימון' }
const panel = (props = {}) => render(
  <SafeAreaProvider initialMetrics={METRICS}>
    <InvoiceActions tx={tx} clientName="נופר" {...props} />
  </SafeAreaProvider>,
)

// A cold transform plus the sheet's async catalog load can outlast jest's 5s default.
jest.setTimeout(20000)

beforeEach(() => { mockInvoke.mockReset(); resetInvoiceCache(); clearToast() })
afterEach(() => { jest.restoreAllMocks() })

describe('the issue panel', () => {
  it('stays out of the way when no provider is connected', async () => {
    serve({ status: () => ({ data: { status: { connected: false } }, error: null }) })
    panel()
    await waitFor(() => expect(calls('status')).toHaveLength(1))
    expect(screen.queryByText(A('issueBtn'))).toBeNull()
  })

  it('needs a client before it can issue', async () => {
    serve()
    panel({ tx: { ...tx, client_id: null } })
    expect(await screen.findByText(A('needClientHint'))).toBeTruthy()
  })

  it('takes two taps to issue, then shows the document', async () => {
    serve({ issue: () => ({ data: { document: { id: 'd1', number: '1001', url: 'https://x/d1', type: 'invoice_receipt' } }, error: null }) })
    const onIssued = jest.fn()
    panel({ onIssued })
    fireEvent.press(await screen.findByText(A('issueBtn')))
    await screen.findByText(/אימון אישי/)
    await act(async () => { fireEvent.press(screen.getByText(A('issue'))) })
    expect(calls('issue')).toHaveLength(0) // armed, not issued
    await act(async () => { fireEvent.press(screen.getByText(A('issueConfirm', { amount: '₪300' }))) })
    expect(calls('issue')).toEqual([expect.objectContaining({ transaction_id: 't1', doc_type: 'invoice_receipt', item_id: '7', item_name: 'אימון אישי', payment_method: 'bank_transfer' })])
    expect(await screen.findByText(/1001/)).toBeTruthy()
    expect(onIssued).toHaveBeenCalled()
    expect(getToast()?.message).toContain('1001')
  })

  it('a likely duplicate needs two explicit confirmations, and cancelling issues nothing', async () => {
    serve()
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const other = { ...tx, id: 't0', invoice_document_id: 'd0' }
    panel({ transactions: [other] })
    fireEvent.press(await screen.findByText(A('issueBtn')))
    await screen.findByText(/אימון אישי/)
    fireEvent.press(screen.getByText(A('issue')))
    expect(alert).toHaveBeenCalledTimes(1)
    const [, reasons, buttons] = alert.mock.calls[0]
    expect(reasons).toContain('נופר')
    await act(async () => { buttons[1].onPress() }) // "yes, I'm sure"
    expect(alert).toHaveBeenCalledTimes(2)
    expect(calls('issue')).toHaveLength(0)
    await act(async () => { alert.mock.calls[1][2][1].onPress() }) // final issue
    expect(calls('issue')).toHaveLength(1)
  })

  it('an unknown outcome turns into the repair panel, never a retry', async () => {
    serve({ issue: () => ({ data: null, error: httpError({ error: 'provider_unreachable', outcome_unknown: true }) }) })
    panel()
    fireEvent.press(await screen.findByText(A('issueBtn')))
    await screen.findByText(/אימון אישי/)
    fireEvent.press(screen.getByText(A('issue')))
    await act(async () => { fireEvent.press(screen.getByText(A('issueConfirm', { amount: '₪300' }))) })
    expect(await screen.findByText(A('doubt.title'))).toBeTruthy()
    expect(screen.queryByText(A('issue'))).toBeNull()
  })

  it('credits an issued document after confirming', async () => {
    serve({ credit: () => ({ data: { document: { id: 'c9', number: '2002' } }, error: null }) })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    panel({ tx: { ...tx, invoice_document_id: 'd1', invoice_document_number: '1001', invoice_document_type: 'invoice_receipt' } })
    fireEvent.press(await screen.findByText(A('creditBtn')))
    expect(calls('credit')).toHaveLength(0)
    await act(async () => { alert.mock.calls[0][2][1].onPress() })
    expect(calls('credit')).toEqual([expect.objectContaining({ transaction_id: 't1' })])
    expect(await screen.findByText(new RegExp(A('cancelled')))).toBeTruthy()
  })

  it('repairs an in-doubt issuance by linking the document the provider has', async () => {
    serve({
      'issue-candidates': () => ({ data: { candidates: [{ id: 'd5', number: '1005', type: 'receipt', amount: 300, amount_matches: true }] }, error: null }),
      'issue-link': () => ({ data: { ok: true }, error: null }),
    })
    panel({ tx: { ...tx, invoice_synced_at: '2026-09-10T10:00:00Z' } })
    await act(async () => { fireEvent.press(await screen.findByText(A('doubt.check'))) })
    await act(async () => { fireEvent.press(await screen.findByText(/1005/)) })
    expect(calls('issue-link')).toEqual([expect.objectContaining({ transaction_id: 't1', document_id: 'd5', document_number: '1005', document_type: 'receipt' })])
    expect(await screen.findByText(A('issuedNumber'), { exact: false })).toBeTruthy()
  })
})

describe('issue on save', () => {
  const sheet = (props) => render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AddTransactionModal open onClose={jest.fn()} clients={[{ id: 'c1', name: 'נופר' }]} {...props} />
    </SafeAreaProvider>,
  )

  it('issues for the row that was just saved', async () => {
    serve({ issue: () => ({ data: { document: { id: 'd1', number: '1001' } }, error: null }) })
    const onSave = jest.fn(async () => ({ id: 'new-row' }))
    const onIssued = jest.fn()
    sheet({ onSave, onIssued, defaults: { client_id: 'c1', type: 'income' } })
    fireEvent.changeText(screen.getByLabelText(i18n.t('modalsData:common.amount')), '250')
    await act(async () => { fireEvent.press(await screen.findByText(TX('issueOnSave'))) })
    await screen.findByText(TX('issueItemSummary', { item: 'אימון אישי' }))
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsData:common.save'))) })
    expect(calls('issue')).toEqual([expect.objectContaining({ transaction_id: 'new-row', item_id: '7' })])
    expect(onIssued).toHaveBeenCalled()
    expect(getToast()?.message).toContain('1001')
  })

  it('without the toggle, saving issues nothing', async () => {
    serve()
    const onSave = jest.fn(async () => ({ id: 'new-row' }))
    sheet({ onSave, defaults: { client_id: 'c1', type: 'income' } })
    fireEvent.changeText(screen.getByLabelText(i18n.t('modalsData:common.amount')), '250')
    await screen.findByText(TX('issueOnSave'))
    await act(async () => { fireEvent.press(screen.getByText(i18n.t('modalsData:common.save'))) })
    expect(onSave).toHaveBeenCalled()
    expect(calls('issue')).toHaveLength(0)
  })

  it('explains instead of offering it when there is no client', async () => {
    serve()
    sheet({ onSave: jest.fn(), defaults: { type: 'income' } })
    expect(await screen.findByText(TX('issueNeedsClient'))).toBeTruthy()
    expect(screen.queryByText(TX('issueOnSave'))).toBeNull()
  })
})
