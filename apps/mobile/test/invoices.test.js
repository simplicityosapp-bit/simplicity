/* ════════════════════════════════════════════════════════════════
   INVOICES CLIENT — what the phone learns from the `invoices` function.
   ════════════════════════════════════════════════════════════════
   Every non-2xx reaches supabase-js as a FunctionsHttpError whose useful
   part — { error, detail, outcome_unknown } — is still unread on
   error.context. Losing it would turn "the provider may have created the
   document" into a plain failure, and a plain failure invites the retry
   that mints a second real tax document. Pinned here: the code, the
   provider's reason and the outcome-unknown flag all survive; the status
   is fetched once per signed-in user and never leaks to the next account.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const getSession = vi.fn()
vi.mock('../src/lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) }, auth: { getSession: (...a) => getSession(...a) } } }))
vi.mock('../src/lib/i18n', () => ({ default: { t: (k, o) => (o ? `${k}${JSON.stringify(o)}` : k) } }))

const { callInvoices, invoiceErrorMessage, loadInvoiceStatus, getInvoiceStatusSnapshot, resetInvoiceCache, issueCandidates, loadInvoiceCatalog } = await import('../src/lib/invoices')

// What supabase-js hands back for a non-2xx: the Response sits on .context.
const httpError = (body) => {
  const res = new Response(JSON.stringify(body), { status: 409, headers: { 'Content-Type': 'application/json' } })
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError', context: res })
}
const session = (id) => ({ data: { session: id ? { user: { id } } : null } })

beforeEach(() => { invoke.mockReset(); getSession.mockReset(); resetInvoiceCache() })

describe('callInvoices', () => {
  it('sends the action with its parameters and returns the data', async () => {
    invoke.mockResolvedValue({ data: { document: { id: 'd1' } }, error: null })
    await expect(callInvoices('issue', { transaction_id: 't1' })).resolves.toEqual({ document: { id: 'd1' } })
    expect(invoke).toHaveBeenCalledWith('invoices', { body: { action: 'issue', transaction_id: 't1' } })
  })

  it('reads the code, the provider reason and outcome_unknown off a non-2xx', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError({ error: 'provider_error', detail: 'timeout', outcome_unknown: true }) })
    const err = await callInvoices('issue', {}).catch((e) => e)
    expect(err.message).toBe('provider_error')
    expect(err.detail).toBe('timeout')
    expect(err.outcomeUnknown).toBe(true)
  })

  it('keeps the original error when the body says nothing usable', async () => {
    const raw = Object.assign(new Error('network down'), { context: new Response('not json', { status: 500 }) })
    invoke.mockResolvedValue({ data: null, error: raw })
    await expect(callInvoices('status')).rejects.toBe(raw)
  })

  it('treats an { error } body on a 200 as a failure too', async () => {
    invoke.mockResolvedValue({ data: { error: 'already_issued' }, error: null })
    await expect(callInvoices('issue')).rejects.toThrow('already_issued')
  })

  it('an empty candidate answer is an empty list, not undefined', async () => {
    invoke.mockResolvedValue({ data: {}, error: null })
    await expect(issueCandidates('t1')).resolves.toEqual([])
  })
})

describe('invoiceErrorMessage', () => {
  it('maps a known code to its sentence', () => {
    expect(invoiceErrorMessage(new Error('already_issued'))).toBe('connections:actions.err.alreadyIssued')
  })

  it('falls back to the generic sentence with its retry wording', () => {
    expect(invoiceErrorMessage(new Error('something_new'))).toBe('connections:actions.err.generic{"retry":"connections:actions.err.retry"}')
  })

  it("appends the provider's reason", () => {
    expect(invoiceErrorMessage(Object.assign(new Error('provider_error'), { detail: 'bad tax id' }))).toBe('connections:actions.err.providerError (bad tax id)')
  })

  it('names the business-type restriction for provider code 2403, whatever the coarse code', () => {
    expect(invoiceErrorMessage(Object.assign(new Error('provider_error'), { detail: 'errorCode 2403' }))).toBe('connections:actions.err.docTypeForBusiness')
  })
})

describe('status', () => {
  it('is fetched once and shared', async () => {
    getSession.mockResolvedValue(session('u1'))
    invoke.mockResolvedValue({ data: { status: { connected: true } }, error: null })
    await Promise.all([loadInvoiceStatus(), loadInvoiceStatus()])
    await loadInvoiceStatus()
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(getInvoiceStatusSnapshot()).toMatchObject({ loaded: true, status: { connected: true } })
  })

  it("does not carry one account's connection into the next", async () => {
    getSession.mockResolvedValue(session('u1'))
    invoke.mockResolvedValue({ data: { status: { connected: true } }, error: null })
    await loadInvoiceStatus()
    getSession.mockResolvedValue(session('u2'))
    invoke.mockResolvedValue({ data: { status: { connected: false } }, error: null })
    await loadInvoiceStatus()
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(getInvoiceStatusSnapshot().status).toEqual({ connected: false })
  })

  it('a failed status call reads as not connected, and loaded', async () => {
    getSession.mockResolvedValue(session('u1'))
    invoke.mockRejectedValue(new Error('offline'))
    await loadInvoiceStatus()
    expect(getInvoiceStatusSnapshot()).toMatchObject({ loaded: true, status: null })
  })

  it('a failed catalog load is retried next time instead of cached', async () => {
    invoke.mockRejectedValueOnce(new Error('offline'))
    await expect(loadInvoiceCatalog()).rejects.toThrow('offline')
    invoke.mockResolvedValue({ data: { items: [{ id: 1, name: 'אימון' }] }, error: null })
    await expect(loadInvoiceCatalog()).resolves.toEqual([{ id: 1, name: 'אימון' }])
  })
})
