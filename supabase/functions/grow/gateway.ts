// ════════════════════════════════════════════════════════════════
//  grow / gateway.ts — Grow (גרו / Meshulam) Light API client.
// ════════════════════════════════════════════════════════════════
//  Grow is a payment GATEWAY (collect money by credit card / Bit /
//  Apple-Google Pay), not an invoice service. Phase 1 only needs to
//  CONNECT + validate credentials; payment links + the payment-received
//  webhook land in later phases.
//
//  Auth: every Light API request carries THREE identifiers as
//  multipart/form-data — NOT JSON (a classic integration mistake):
//      pageCode, userId, apiKey.
//  Base URLs:
//      sandbox    → https://sandbox.meshulam.co.il/api/light/server/1.0
//      production → https://secure.meshulam.co.il/api/light/server/1.0
//
//  ⚠️ UNVERIFIED: verifyCredentials below is implemented from the
//  documented Grow API but has NOT been live-tested against a real Grow
//  sandbox account (we have no test credentials, and the Grow docs render
//  client-side / weren't machine-readable at build time). Live-verify with
//  a real sandbox userId/pageCode/apiKey before any user relies on it —
//  exactly like the (also-unverified) Green Invoice provider. The coarse
//  invalid_credentials vs provider_error split may need tightening once the
//  real response envelope is observed.
// ════════════════════════════════════════════════════════════════

export type GrowEnv = 'sandbox' | 'production'

export interface GrowCredentials {
  userId: string
  pageCode: string
  apiKey: string
  environment: GrowEnv
}

/* Reference to a created payment process — returned by createPaymentLink and
   fed back to getPaymentInfo / approveTransaction. */
export interface GrowProcessRef {
  processId?: string | null
  processToken?: string | null
}

export interface PaymentLinkInput {
  amount: number
  description: string
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
  successUrl: string
  cancelUrl: string
  notifyUrl: string       // our grow-webhook URL (carries the per-user token)
  correlationId: string   // our payment_requests.id — echoed back in the callback (cField1)
}

export interface PaymentLinkResult {
  url: string
  processId: string | null
  processToken: string | null
}

export interface PaymentInfo {
  paid: boolean
  transactionId: string | null
  amount: number | null
  raw: unknown
}

/* A thrown GrowError carries a coarse `code` the HTTP layer maps to a safe
   client message — the raw upstream body is NEVER sent to the browser.
   Mirrors invoices/providers.ts ProviderError. `detail` is an OPTIONAL,
   already-sanitized one-liner (Grow's own message) the HTTP layer may
   surface to make a failure actionable. */
export class GrowError extends Error {
  code: 'invalid_credentials' | 'provider_unreachable' | 'provider_error'
  detail?: string
  constructor(code: GrowError['code'], message: string, detail?: string) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

const BASE: Record<GrowEnv, string> = {
  sandbox: 'https://sandbox.meshulam.co.il/api/light/server/1.0',
  production: 'https://secure.meshulam.co.il/api/light/server/1.0',
}

/* Pull a short, safe human message out of a Grow error envelope. Grow returns
   shapes like { status: 0, err: { messages: [...] } } or { errMessage }. Never
   returns the whole body. */
function growErrorDetail(body: any): string | undefined {
  try {
    const raw = body?.err?.messages ?? body?.errMessage ?? body?.data?.errMessage ?? body?.message
    if (Array.isArray(raw)) {
      const s = raw.filter(Boolean).map((m: any) => (typeof m === 'string' ? m : JSON.stringify(m))).join(' — ').trim()
      if (s) return s.slice(0, 300)
    } else if (typeof raw === 'string' && raw.trim()) {
      return raw.trim().slice(0, 300)
    }
  } catch { /* ignore — fall through */ }
  return undefined
}

export class GrowGateway {
  /* Validate credentials with a real call. Grow has no documented read-only
     "ping", so we probe createPaymentProcess with a tiny amount: it creates a
     short-lived (10-minute) payment page but charges NOTHING (no card is ever
     entered), and its response envelope tells us whether auth was accepted.

     A successful envelope (status 1, or a payment URL/process token) → the
     credentials are valid. Any failure envelope is treated as invalid
     credentials (with Grow's own message as `detail`) — the probe sends all
     required fields, so the most likely cause of a failure here is a bad
     userId/pageCode/apiKey. UNVERIFIED (see file header). */
  async verifyCredentials(creds: GrowCredentials): Promise<void> {
    const form = new FormData()
    form.append('pageCode', creds.pageCode)
    form.append('userId', creds.userId)
    if (creds.apiKey) form.append('apiKey', creds.apiKey)
    form.append('sum', '1')
    form.append('description', 'אימות חיבור — Simplicity')
    form.append('pageField[fullName]', 'בדיקה')
    form.append('pageField[phone]', '0500000000')

    let res: Response
    try {
      res = await fetch(`${BASE[creds.environment]}/createPaymentProcess`, { method: 'POST', body: form })
    } catch (e) {
      throw new GrowError('provider_unreachable', `grow unreachable: ${e}`)
    }
    if (res.status === 401 || res.status === 403) {
      throw new GrowError('invalid_credentials', `grow rejected credentials (${res.status})`)
    }
    if (!res.ok) {
      throw new GrowError('provider_error', `grow http ${res.status}`)
    }
    const data = (await res.json().catch(() => ({}))) as any
    // Grow success envelope: status === 1 (and a payment URL / process token).
    if (data?.status === 1 || data?.data?.url || data?.data?.processToken || data?.data?.processId) return
    // Failure → most likely bad credentials for a fully-formed probe. Surface
    // Grow's own message so the user can see the real reason.
    throw new GrowError('invalid_credentials', 'grow rejected the request', growErrorDetail(data))
  }

  /* Create a hosted payment page for `input.amount` and return its URL.
     Uses createPaymentProcess; passes our notifyUrl (the grow-webhook) and our
     correlationId (cField1) so the server callback can be tied back to the
     payment_requests row. ⚠️ UNVERIFIED — field names + success envelope must be
     confirmed against a live account. NOTE: the createPaymentProcess URL is valid
     ~10 minutes; for "send a link to pay later" we may need Grow's long-lived
     Payment-Link product (swap this one call when verified). */
  async createPaymentLink(creds: GrowCredentials, input: PaymentLinkInput): Promise<PaymentLinkResult> {
    const form = new FormData()
    form.append('pageCode', creds.pageCode)
    form.append('userId', creds.userId)
    if (creds.apiKey) form.append('apiKey', creds.apiKey)
    form.append('sum', String(input.amount))
    form.append('description', input.description || 'תשלום')
    form.append('pageField[fullName]', input.customerName || 'לקוח')
    if (input.customerPhone) form.append('pageField[phone]', input.customerPhone)
    if (input.customerEmail) form.append('pageField[email]', input.customerEmail)
    form.append('successUrl', input.successUrl)
    form.append('cancelUrl', input.cancelUrl)
    form.append('notifyUrl', input.notifyUrl)
    form.append('cField1', input.correlationId)

    let res: Response
    try {
      res = await fetch(`${BASE[creds.environment]}/createPaymentProcess`, { method: 'POST', body: form })
    } catch (e) {
      throw new GrowError('provider_unreachable', `grow unreachable: ${e}`)
    }
    if (res.status === 401 || res.status === 403) throw new GrowError('invalid_credentials', `grow rejected credentials (${res.status})`)
    if (!res.ok) throw new GrowError('provider_error', `grow http ${res.status}`)
    const data = (await res.json().catch(() => ({}))) as any
    const d = data?.data ?? {}
    const url = d.url ?? d.paymentUrl ?? (typeof data?.url === 'string' ? data.url : null)
    if (data?.status !== 1 || !url) throw new GrowError('provider_error', 'grow createPaymentProcess failed', growErrorDetail(data))
    return {
      url: String(url),
      processId: d.processId != null ? String(d.processId) : (d.processToken ? null : null),
      processToken: d.processToken ?? d.token ?? null,
    }
  }

  /* Re-fetch the authoritative status of a payment process — the webhook calls
     this so it NEVER trusts the callback body for money. ⚠️ UNVERIFIED. */
  async getPaymentInfo(creds: GrowCredentials, ref: GrowProcessRef): Promise<PaymentInfo> {
    const form = new FormData()
    form.append('pageCode', creds.pageCode)
    form.append('userId', creds.userId)
    if (creds.apiKey) form.append('apiKey', creds.apiKey)
    if (ref.processId) form.append('processId', ref.processId)
    if (ref.processToken) form.append('processToken', ref.processToken)
    let res: Response
    try {
      res = await fetch(`${BASE[creds.environment]}/getPaymentProcessInfo`, { method: 'POST', body: form })
    } catch (e) {
      throw new GrowError('provider_unreachable', `grow unreachable: ${e}`)
    }
    if (!res.ok) throw new GrowError('provider_error', `grow http ${res.status}`)
    const data = (await res.json().catch(() => ({}))) as any
    const d = data?.data ?? {}
    const txId = d.transactionId ?? d.transactionID ?? d.asmachta ?? null
    const amount = Number.isFinite(Number(d.sum ?? d.amount)) ? Number(d.sum ?? d.amount) : null
    return { paid: data?.status === 1 && !!txId, transactionId: txId != null ? String(txId) : null, amount, raw: data }
  }

  /* Acknowledge a transaction back to Grow — MANDATORY (many integrations miss
     it). Best-effort; throws only on a network failure. ⚠️ UNVERIFIED params. */
  async approveTransaction(creds: GrowCredentials, ref: GrowProcessRef): Promise<void> {
    const form = new FormData()
    form.append('pageCode', creds.pageCode)
    form.append('userId', creds.userId)
    if (creds.apiKey) form.append('apiKey', creds.apiKey)
    if (ref.processId) form.append('processId', ref.processId)
    if (ref.processToken) form.append('processToken', ref.processToken)
    try {
      await fetch(`${BASE[creds.environment]}/approveTransaction`, { method: 'POST', body: form })
    } catch (e) {
      throw new GrowError('provider_unreachable', `grow approve unreachable: ${e}`)
    }
  }
}

export const gateway = new GrowGateway()
