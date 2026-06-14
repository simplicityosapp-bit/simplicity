// ════════════════════════════════════════════════════════════════
//  invoices / providers.ts — the provider abstraction layer.
// ════════════════════════════════════════════════════════════════
//  One interface, one implementation per invoice service. The rest of
//  the function (connect / status / test / disconnect) is provider-
//  agnostic — adding a service (later: iCount…) means writing a class
//  here and registering it in PROVIDERS, with ZERO changes to index.ts.
//
//  The two services authenticate very differently, so the interface is
//  the lowest common denominator — "are these credentials valid?":
//    • Green Invoice (morning): POST id+secret to /account/token → JWT.
//      A successful mint proves the credentials.
//    • SUMIT (OfficeGuy): no token — every request carries a
//      { CompanyID, APIKey } Credentials object. We validate with a
//      READ-ONLY list call and inspect the Status envelope.
//
//  Credential storage maps onto the two generic columns (migration 0033):
//    api_key    = the identifier  (GI key id  / SUMIT CompanyID)
//    api_secret = the secret      (GI secret  / SUMIT APIKey)
// ════════════════════════════════════════════════════════════════

export type InvoiceEnv = 'sandbox' | 'production'

export interface InvoiceCredentials {
  apiKey: string
  apiSecret: string | null
  environment: InvoiceEnv
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

export interface InvoiceProvider {
  readonly name: string
  /* Validate the user's credentials with a real, READ-ONLY call. Resolves
     when valid; throws ProviderError otherwise. Used by connect + test. */
  verifyCredentials(creds: InvoiceCredentials): Promise<void>
}

// ── Green Invoice (morning) ───────────────────────────────────────
class GreenInvoiceProvider implements InvoiceProvider {
  readonly name = 'greeninvoice'

  private base(env: InvoiceEnv): string {
    return env === 'sandbox'
      ? 'https://sandbox.d.greeninvoice.co.il/api/v1'
      : 'https://api.greeninvoice.co.il/api/v1'
  }

  async verifyCredentials(creds: InvoiceCredentials): Promise<void> {
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
    if (!res.ok) {
      throw new ProviderError('provider_error', `green-invoice token error ${res.status}: ${await res.text()}`)
    }
    const data = (await res.json().catch(() => ({}))) as { token?: string }
    if (!data.token) throw new ProviderError('provider_error', 'green-invoice returned no token')
  }
}

// ── SUMIT (OfficeGuy) ─────────────────────────────────────────────
class SumitProvider implements InvoiceProvider {
  readonly name = 'sumit'

  /* SUMIT's accounting API has ONE host. The environment flag is still
     stored (it governs payment test-mode in later stages), but credential
     validation always hits the live host with a read-only call. */
  private base(): string {
    return 'https://api.sumit.co.il'
  }

  async verifyCredentials(creds: InvoiceCredentials): Promise<void> {
    // api_key holds the CompanyID (numeric); api_secret holds the APIKey.
    const companyId = Number(creds.apiKey)
    if (!companyId || !creds.apiSecret) {
      throw new ProviderError('invalid_credentials', 'sumit needs a numeric CompanyID + APIKey')
    }
    let res: Response
    try {
      // Read-only: lists documents. Requires valid Credentials; creates nothing.
      res = await fetch(`${this.base()}/accounting/documents/list/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Credentials: { CompanyID: companyId, APIKey: creds.apiSecret } }),
      })
    } catch (e) {
      throw new ProviderError('provider_unreachable', `sumit unreachable: ${e}`)
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('invalid_credentials', `sumit rejected credentials (${res.status})`)
    }
    if (!res.ok) {
      throw new ProviderError('provider_error', `sumit http ${res.status}`)
    }
    /* SUMIT returns HTTP 200 even on auth failure — the real result is in the
       Status envelope (0 = success). Non-zero on connect ⇒ bad credentials. */
    const data = (await res.json().catch(() => ({}))) as { Status?: number; UserErrorMessage?: string }
    if (data.Status !== 0) {
      throw new ProviderError('invalid_credentials', `sumit status ${data.Status}: ${data.UserErrorMessage ?? ''}`)
    }
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
