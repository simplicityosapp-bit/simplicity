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
}

export const gateway = new GrowGateway()
