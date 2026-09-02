/* ════════════════════════════════════════════════════════════════
   INVOICE PROVIDERS SUITE — the money path, and the one bit of it that
   decides whether a retry is safe.

   Issuing a document is irreversible: it mints a real tax document with a real
   running number, sends it to a real customer, and is reported to the
   authorities. The only correction is a credit note. So when a call fails, the
   single most important question is "did the provider create it anyway?" —
   and ProviderError.settled is the answer the rest of the system trusts.

   `settled: true` means the provider's own response proves nothing was
   created, so the caller may release its claim and let the user retry.
   Anything else means "maybe", and maybe is treated as yes. Getting one of
   these backwards is a duplicate tax document, which is why every failure
   mode of both providers is pinned here.

   providers.ts imports nothing and touches no runtime, so it runs under Vitest
   exactly as it runs under Deno.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getProvider, ProviderError } from '../../../supabase/functions/invoices/providers.ts'

const SUMIT = { apiKey: '12345', apiSecret: 'secret', environment: 'production' }
const GI = { apiKey: 'id', apiSecret: 'secret', environment: 'production' }

const DOC = {
  docType: 'receipt', amount: 100, description: 'desc', itemName: 'item', itemId: null,
  paymentMethod: 'bank_transfer',
  customer: { name: 'לקוח', email: null, phone: null, taxId: null },
  send: false, businessType: null,
}

/* Minimal stand-ins for fetch's Response — the code only reads these four. */
const reply = (status, body, { text } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (text ?? JSON.stringify(body)),
})

/* Route by URL so a test can fail the token call and the create call
   independently — the distinction C2 turns on for Green Invoice. */
function mockFetch(routes) {
  return vi.fn(async (url) => {
    for (const [match, handler] of routes) {
      if (String(url).includes(match)) {
        const r = typeof handler === 'function' ? handler() : handler
        if (r instanceof Error) throw r
        return r
      }
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

let realFetch
beforeEach(() => { realFetch = globalThis.fetch })
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks() })

/* Run createDocument and hand back the ProviderError it threw. */
async function failureOf(provider, creds, doc = DOC) {
  try {
    await getProvider(provider).createDocument(creds, doc)
    throw new Error('expected createDocument to throw')
  } catch (e) {
    expect(e, 'threw a ProviderError').toBeInstanceOf(ProviderError)
    return e
  }
}

describe('SUMIT — is a retry safe?', () => {
  it('settles a rejected credential: nothing was created', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', reply(401, {})]])
    const e = await failureOf('sumit', SUMIT)
    expect(e.code).toBe('invalid_credentials')
    expect(e.settled).toBe(true)
  })

  it('settles a 4xx: SUMIT refused the request outright', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', reply(400, {})]])
    expect((await failureOf('sumit', SUMIT)).settled).toBe(true)
  })

  it('settles a non-zero Status — its own structured refusal, after reading the request', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', reply(200, { Status: 3, UserErrorMessage: 'bad item' })]])
    const e = await failureOf('sumit', SUMIT)
    expect(e.code).toBe('provider_error')
    expect(e.settled).toBe(true)
  })

  it('does NOT settle a 5xx — it may have created the document before failing', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', reply(503, {})]])
    expect((await failureOf('sumit', SUMIT)).settled).toBe(false)
  })

  it('does NOT settle a network failure — the request may have arrived', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', new Error('ECONNRESET')]])
    const e = await failureOf('sumit', SUMIT)
    expect(e.code).toBe('provider_unreachable')
    expect(e.settled).toBe(false)
  })

  it('does NOT settle a success with no DocumentID — it said yes and told us nothing', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', reply(200, { Status: 0, Data: {} })]])
    expect((await failureOf('sumit', SUMIT)).settled).toBe(false)
  })

  it('sends the amount VAT-inclusive, and a payment line for a receipt', async () => {
    let sent
    globalThis.fetch = vi.fn(async (_u, init) => {
      sent = JSON.parse(init.body)
      return reply(200, { Status: 0, Data: { DocumentID: 7, DocumentNumber: 70 } })
    })
    const out = await getProvider('sumit').createDocument(SUMIT, DOC)
    // The stored amount is the gross the coach received; saying otherwise
    // makes the document total amount x 1.18 for a licensed business.
    expect(sent.VATIncluded).toBe(true)
    expect(sent.Items[0].UnitPrice).toBe(100)
    expect(sent.Payments?.[0]?.Amount).toBe(100)
    expect(out).toMatchObject({ id: '7', number: '70', type: 'receipt' })
  })

  it('sends no payment line for a plain invoice, which records no payment', async () => {
    let sent
    globalThis.fetch = vi.fn(async (_u, init) => {
      sent = JSON.parse(init.body)
      return reply(200, { Status: 0, Data: { DocumentID: 8 } })
    })
    await getProvider('sumit').createDocument(SUMIT, { ...DOC, docType: 'invoice' })
    expect(sent.Payments).toBeUndefined()
  })
})

describe('Green Invoice — is a retry safe?', () => {
  const token = ['account/token', reply(200, { token: 'jwt' })]

  it('settles every token failure: /documents was never called', async () => {
    for (const failure of [reply(401, {}), reply(500, {}, { text: 'boom' }), new Error('offline')]) {
      globalThis.fetch = mockFetch([['account/token', failure]])
      expect((await failureOf('greeninvoice', GI)).settled).toBe(true)
    }
  })

  it('settles a 4xx on create — morning refused the document', async () => {
    globalThis.fetch = mockFetch([token, ['/documents', reply(422, {}, { text: '{"errorCode":2403}' })]])
    const e = await failureOf('greeninvoice', GI)
    expect(e.settled).toBe(true)
    expect(e.detail).toContain('2403') // surfaced so the UI can say "pick קבלה"
  })

  it('does NOT settle a 5xx on create', async () => {
    globalThis.fetch = mockFetch([token, ['/documents', reply(502, {}, { text: 'bad gateway' })]])
    expect((await failureOf('greeninvoice', GI)).settled).toBe(false)
  })

  it('does NOT settle a network failure on create', async () => {
    globalThis.fetch = mockFetch([token, ['/documents', new Error('ETIMEDOUT')]])
    expect((await failureOf('greeninvoice', GI)).settled).toBe(false)
  })

  it('does NOT settle a 200 with no document id', async () => {
    globalThis.fetch = mockFetch([token, ['/documents', reply(200, {})]])
    expect((await failureOf('greeninvoice', GI)).settled).toBe(false)
  })

  it('marks income VAT-inclusive for a licensed business, and not otherwise', async () => {
    const bodyFor = async (businessType) => {
      let sent
      globalThis.fetch = vi.fn(async (url, init) => {
        if (String(url).includes('account/token')) return reply(200, { token: 'jwt' })
        sent = JSON.parse(init.body)
        return reply(200, { id: 'abc', number: 5 })
      })
      await getProvider('greeninvoice').createDocument(GI, { ...DOC, businessType })
      return sent
    }
    // עוסק מורשה: our amount is already gross, so morning must be told so —
    // otherwise it adds VAT on top and the total becomes amount x 1.18.
    expect((await bodyFor('licensed')).income[0].vatType).toBe(1)
    expect((await bodyFor('exempt')).income[0].vatType).toBeUndefined()
    expect((await bodyFor(null)).income[0].vatType).toBeUndefined()
  })
})

describe('document lookup: "none" and "could not tell" are different answers', () => {
  it('degrades to [] by default, so the poller just retries next run', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', reply(500, {})]])
    await expect(getProvider('sumit').listDocumentsSince(SUMIT, '2026-01-01')).resolves.toEqual([])
  })

  it('raises under strict, so the repair flow never reports "no document exists"', async () => {
    globalThis.fetch = mockFetch([['sumit.co.il', reply(500, {})]])
    await expect(getProvider('sumit').listDocumentsSince(SUMIT, '2026-01-01', true)).rejects.toThrow()
  })

  it('same for Green Invoice, whose search endpoint is the unverified one', async () => {
    globalThis.fetch = mockFetch([['account/token', reply(200, { token: 'jwt' })], ['documents/search', reply(500, {})]])
    await expect(getProvider('greeninvoice').listDocumentsSince(GI, '2026-01-01')).resolves.toEqual([])
    globalThis.fetch = mockFetch([['account/token', reply(200, { token: 'jwt' })], ['documents/search', reply(500, {})]])
    await expect(getProvider('greeninvoice').listDocumentsSince(GI, '2026-01-01', true)).rejects.toThrow()
  })
})

describe('unsettled is the default for any new failure site', () => {
  it('a ProviderError built without saying so is treated as "maybe it exists"', () => {
    expect(new ProviderError('provider_error', 'x').settled).toBe(false)
  })
})
