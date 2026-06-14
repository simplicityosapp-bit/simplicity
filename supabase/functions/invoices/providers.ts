// ════════════════════════════════════════════════════════════════
//  invoices / providers.ts — the provider abstraction layer.
// ════════════════════════════════════════════════════════════════
//  One interface, one implementation per invoice service. The rest of
//  the function (connect / status / test / issue) is provider-agnostic.
//  Adding a service means writing a class here + registering it.
//
//  Auth models differ:
//    • Green Invoice (morning): POST id+secret to /account/token → JWT,
//      then Bearer on every call.
//    • SUMIT (OfficeGuy): no token — every request carries a
//      { CompanyID, APIKey } Credentials object; responses use a Status
//      envelope (0 = success) and return HTTP 200 even on auth failure.
//
//  Credential columns (migration 0033): api_key = identifier
//  (GI key id / SUMIT CompanyID), api_secret = secret (GI secret /
//  SUMIT APIKey).
// ════════════════════════════════════════════════════════════════

export type InvoiceEnv = 'sandbox' | 'production'

export interface InvoiceCredentials {
  apiKey: string
  apiSecret: string | null
  environment: InvoiceEnv
}

/* Normalized document types the UI offers. Each provider maps them to its
   own codes. The user picks per issuance (covers עוסק פטור → receipt and
   עוסק מורשה → invoice_receipt without assuming a tax status). */
export type DocType = 'invoice_receipt' | 'receipt' | 'invoice'

export type PaymentMethod = 'cash' | 'bank_transfer' | 'credit_card' | 'cheque' | 'app' | 'other'

export interface InvoiceDocInput {
  docType: DocType
  amount: number // gross total (currency ILS for now)
  description: string
  itemName: string // the product/service line on the document
  itemId?: string | null // optional catalog item id (SUMIT income item) — overrides the ad-hoc name
  paymentMethod: PaymentMethod // only used by receipt-type docs
  customer: { name: string; email: string | null; phone: string | null }
  send: boolean // ask the provider to send the doc to the customer (only acts if contact info exists)
}

// Payment-method code per provider.
// SUMIT (Accounting_Typed_DocumentPaymentType): Cash 2, BankTransfer 3, Cheque 4, CreditCard 5, Digital 6, Other 8.
const SUMIT_PAYMENT: Record<PaymentMethod, number> = { cash: 2, bank_transfer: 3, credit_card: 5, cheque: 4, app: 6, other: 8 }
// Green Invoice payment.type (morning enum): cash 1, cheque 2, credit_card 3, bank_transfer 4, paypal 5, payment_app 10, other 11. (Still unverified against a live GI key.)
const GI_PAYMENT: Record<PaymentMethod, number> = { cash: 1, cheque: 2, credit_card: 3, bank_transfer: 4, app: 10, other: 11 }

/* SUMIT/.NET dates arrive as ISO, "/Date(ms)/", or DD/MM/YYYY — return YYYY-MM-DD or null. */
function normalizeDate(d: unknown): string | null {
  if (typeof d !== 'string' || !d) return null
  const dotnet = d.match(/\/Date\((\d+)\)\//)
  if (dotnet) return new Date(Number(dotnet[1])).toISOString().slice(0, 10)
  const dmy = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const t = Date.parse(d)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null
}

export interface InvoiceDocResult {
  id: string
  number: string
  url: string | null
  type: DocType
}

/* A thrown ProviderError carries a coarse `code` the HTTP layer maps to a
   safe client message — the raw upstream body is NEVER sent to the browser. */
export class ProviderError extends Error {
  code: 'invalid_credentials' | 'provider_unreachable' | 'provider_error'
  constructor(code: ProviderError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/* A document re-fetched by id (Route B) — never trust the webhook body,
   always pull the authoritative details. */
export interface FetchedDoc {
  externalId: string
  docType: DocType | null
  number: string | null
  amount: number | null
  currency: string
  date: string | null // YYYY-MM-DD
  customerName: string | null
  url: string | null
  raw: unknown
}

/* A product/service from the provider's catalog (SUMIT income items). */
export interface CatalogItem {
  id: string
  name: string
  price: number | null
}

export interface InvoiceProvider {
  readonly name: string
  /* Validate credentials with a real, READ-ONLY call. Used by connect + test. */
  verifyCredentials(creds: InvoiceCredentials): Promise<void>
  /* Issue a REAL document at the provider. Used by the `issue` action. */
  createDocument(creds: InvoiceCredentials, doc: InvoiceDocInput): Promise<InvoiceDocResult>
  /* Re-fetch a document by its provider id (Route B webhook → authoritative
     details). Returns null if the document can't be found. */
  fetchDocument(creds: InvoiceCredentials, externalId: string): Promise<FetchedDoc | null>
  /* The user's product/service catalog (for the issuance picker). Empty array
     when the provider has no catalog wired — the UI falls back to free text. */
  listItems(creds: InvoiceCredentials): Promise<CatalogItem[]>
}

// ── Green Invoice (morning) ───────────────────────────────────────
// NOTE: createDocument here is implemented from the documented API but is
// NOT yet live-verified (no GI sandbox key available). Verify with a GI
// tester before any GI user relies on it. connect/test ARE the same as the
// (also-unverified-happy-path) GI auth — SUMIT is the verified provider.
class GreenInvoiceProvider implements InvoiceProvider {
  readonly name = 'greeninvoice'
  // morning document type codes: 305 = חשבונית מס, 320 = חשבונית מס/קבלה, 400 = קבלה
  private static TYPE: Record<DocType, number> = { invoice: 305, invoice_receipt: 320, receipt: 400 }

  private base(env: InvoiceEnv): string {
    return env === 'sandbox'
      ? 'https://sandbox.d.greeninvoice.co.il/api/v1'
      : 'https://api.greeninvoice.co.il/api/v1'
  }

  /* Mint a JWT from id+secret. Success also proves the credentials. */
  private async token(creds: InvoiceCredentials): Promise<string> {
    let res: Response
    try {
      res = await fetch(`${this.base(creds.environment)}/account/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: creds.apiKey, secret: creds.apiSecret }),
      })
    } catch (e) {
      throw new ProviderError('provider_unreachable', `green-invoice unreachable: ${e}`)
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('invalid_credentials', `green-invoice rejected credentials (${res.status})`)
    }
    if (!res.ok) throw new ProviderError('provider_error', `green-invoice token error ${res.status}: ${await res.text()}`)
    const data = (await res.json().catch(() => ({}))) as { token?: string }
    if (!data.token) throw new ProviderError('provider_error', 'green-invoice returned no token')
    return data.token
  }

  async verifyCredentials(creds: InvoiceCredentials): Promise<void> {
    await this.token(creds)
  }

  async createDocument(creds: InvoiceCredentials, doc: InvoiceDocInput): Promise<InvoiceDocResult> {
    const token = await this.token(creds)
    const type = GreenInvoiceProvider.TYPE[doc.docType]
    const isReceipt = doc.docType !== 'invoice' // 320 + 400 record a payment
    const body: Record<string, unknown> = {
      type,
      lang: 'he',
      currency: 'ILS',
      vatType: 0, // apply the business's default VAT config
      client: {
        name: doc.customer.name,
        emails: doc.send && doc.customer.email ? [doc.customer.email] : [],
      },
      income: [{ description: doc.itemName || doc.description, quantity: 1, price: doc.amount, currency: 'ILS', vatType: 0 }],
    }
    if (isReceipt) {
      body.payment = [{ type: GI_PAYMENT[doc.paymentMethod] ?? GI_PAYMENT.other, price: doc.amount, currency: 'ILS' }]
    }
    let res: Response
    try {
      res = await fetch(`${this.base(creds.environment)}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
    } catch (e) {
      throw new ProviderError('provider_unreachable', `green-invoice unreachable: ${e}`)
    }
    if (!res.ok) throw new ProviderError('provider_error', `green-invoice create error ${res.status}: ${await res.text()}`)
    const data = (await res.json().catch(() => ({}))) as any
    if (!data.id) throw new ProviderError('provider_error', 'green-invoice returned no document id')
    const url = data?.url?.origin ?? data?.url?.he ?? (typeof data?.url === 'string' ? data.url : null)
    return { id: String(data.id), number: String(data.number ?? data.id), url, type: doc.docType }
  }

  async fetchDocument(_creds: InvoiceCredentials, _externalId: string): Promise<FetchedDoc | null> {
    // Route B for Green Invoice is deferred (their document-created webhook is
    // undocumented). Implement GET /documents/{id} when GI Route B is built.
    throw new ProviderError('provider_error', 'green-invoice fetchDocument not implemented yet')
  }

  async listItems(creds: InvoiceCredentials): Promise<CatalogItem[]> {
    // morning catalog (POST /items/search). UNVERIFIED — degrade to [] on any
    // failure so the issuance picker just falls back to free text (never breaks).
    try {
      const token = await this.token(creds)
      const res = await fetch(`${this.base(creds.environment)}/items/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ page: 1, pageSize: 100 }),
      })
      if (!res.ok) { console.error('green-invoice items error', res.status); return [] }
      const data = (await res.json().catch(() => ({}))) as any
      const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
      return items
        .map((it: any) => ({ id: it.id != null ? String(it.id) : '', name: it.name ?? '', price: Number.isFinite(Number(it.price)) ? Number(it.price) : null }))
        .filter((it: any) => it.id && it.name)
    } catch (e) {
      console.error('green-invoice items failed', e)
      return []
    }
  }
}

// ── SUMIT (OfficeGuy) ─────────────────────────────────────────────
class SumitProvider implements InvoiceProvider {
  readonly name = 'sumit'
  // OfficeGuy DocumentType: 0 = Invoice, 1 = InvoiceAndReceipt, 2 = Receipt
  private static TYPE: Record<DocType, number> = { invoice: 0, invoice_receipt: 1, receipt: 2 }

  private base(): string {
    return 'https://api.sumit.co.il'
  }

  /* Every call posts a Credentials object + reads the Status envelope. */
  private async post(creds: InvoiceCredentials, path: string, payload: Record<string, unknown>): Promise<any> {
    const companyId = Number(creds.apiKey)
    if (!companyId || !creds.apiSecret) throw new ProviderError('invalid_credentials', 'sumit needs a numeric CompanyID + APIKey')
    let res: Response
    try {
      res = await fetch(`${this.base()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Credentials: { CompanyID: companyId, APIKey: creds.apiSecret }, ...payload }),
      })
    } catch (e) {
      throw new ProviderError('provider_unreachable', `sumit unreachable: ${e}`)
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('invalid_credentials', `sumit rejected credentials (${res.status})`)
    if (!res.ok) throw new ProviderError('provider_error', `sumit http ${res.status}`)
    // SUMIT returns HTTP 200 even on failure — the result is in the Status envelope (0 = success).
    const data = (await res.json().catch(() => ({}))) as { Status?: number; UserErrorMessage?: string; Data?: any }
    if (data.Status !== 0) throw new ProviderError('provider_error', `sumit status ${data.Status}: ${data.UserErrorMessage ?? ''}`)
    return data.Data
  }

  async verifyCredentials(creds: InvoiceCredentials): Promise<void> {
    // Read-only: lists documents. Requires valid Credentials; creates nothing.
    await this.post(creds, '/accounting/documents/list/', {})
  }

  async createDocument(creds: InvoiceCredentials, doc: InvoiceDocInput): Promise<InvoiceDocResult> {
    const type = SumitProvider.TYPE[doc.docType]
    const isReceipt = doc.docType !== 'invoice' // 1 + 2 record a payment
    const details: Record<string, unknown> = {
      Type: type,
      Customer: { Name: doc.customer.name, EmailAddress: doc.customer.email || undefined, Phone: doc.customer.phone || undefined },
    }
    if (doc.send && doc.customer.email) {
      details.SendByEmail = { EmailAddress: doc.customer.email, Original: true, SendAsPaymentRequest: false }
    }
    const payload: Record<string, unknown> = {
      Details: details,
      Items: [{
        Item: doc.itemId ? { ID: Number(doc.itemId), Name: doc.itemName || undefined } : { Name: doc.itemName || doc.description || 'שירות' },
        Quantity: 1, UnitPrice: doc.amount, Description: doc.description || undefined,
      }],
      VATIncluded: true, // the recorded amount is the gross the coach received; SUMIT applies the company's VAT config
    }
    // Receipt-type docs require a payment line — with the user-chosen method.
    if (isReceipt) payload.Payments = [{ Amount: doc.amount, Type: SUMIT_PAYMENT[doc.paymentMethod] ?? SUMIT_PAYMENT.other }]

    const data = await this.post(creds, '/accounting/documents/create/', payload)
    if (!data?.DocumentID) throw new ProviderError('provider_error', 'sumit returned no DocumentID')
    return {
      id: String(data.DocumentID),
      number: String(data.DocumentNumber ?? data.DocumentID),
      url: data.DocumentDownloadURL ?? null,
      type: doc.docType,
    }
  }

  /* Re-fetch a document by EntityID (from a trigger/webhook). Read-only. */
  async fetchDocument(creds: InvoiceCredentials, externalId: string): Promise<FetchedDoc | null> {
    const data = await this.post(creds, '/accounting/documents/getdetails/', { DocumentID: Number(externalId) })
    const doc = data?.Document
    if (!doc) return null
    /* OfficeGuy may serialize the enum as an int, a name, or "Name (n)" —
       normalize all three. */
    const normType = (t: unknown): DocType | null => {
      const byNum: Record<number, DocType> = { 0: 'invoice', 1: 'invoice_receipt', 2: 'receipt' }
      const byName: Record<string, DocType> = { Invoice: 'invoice', InvoiceAndReceipt: 'invoice_receipt', Receipt: 'receipt' }
      if (typeof t === 'number') return byNum[t] ?? null
      if (typeof t === 'string') {
        const m = t.match(/\((\d+)\)/)
        if (m) return byNum[Number(m[1])] ?? null
        if (byName[t]) return byName[t]
        if (/^\d+$/.test(t)) return byNum[Number(t)] ?? null
      }
      return null
    }
    return {
      externalId: String(data.DocumentID ?? externalId),
      docType: normType(doc.Type),
      number: data.DocumentNumber != null ? String(data.DocumentNumber) : null,
      amount: Number.isFinite(Number(doc.DocumentValue)) ? Number(doc.DocumentValue) : null,
      currency: typeof doc.Currency === 'string' ? doc.Currency : 'ILS',
      date: normalizeDate(doc.Date),
      customerName: doc.Customer?.Name ?? null,
      url: data.DocumentDownloadURL ?? null,
      raw: data,
    }
  }

  async listItems(creds: InvoiceCredentials): Promise<CatalogItem[]> {
    const data = await this.post(creds, '/accounting/incomeitems/list/', {})
    const items = (data?.IncomeItems ?? []) as any[]
    return items
      .map((it) => ({ id: it.ID != null ? String(it.ID) : '', name: it.Name ?? '', price: Number.isFinite(Number(it.Price)) ? Number(it.Price) : null }))
      .filter((it) => it.id && it.name)
  }
}

// ── Registry ──────────────────────────────────────────────────────
const PROVIDERS: Record<string, InvoiceProvider> = {
  greeninvoice: new GreenInvoiceProvider(),
  sumit: new SumitProvider(),
}

export const INVOICE_PROVIDERS = Object.keys(PROVIDERS)

export function getProvider(name: string): InvoiceProvider {
  const p = PROVIDERS[name]
  if (!p) throw new ProviderError('provider_error', `unknown provider: ${name}`)
  return p
}
