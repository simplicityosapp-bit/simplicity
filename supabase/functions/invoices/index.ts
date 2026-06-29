// ════════════════════════════════════════════════════════════════
//  invoices — connect Israeli invoice services (Green Invoice / SUMIT)
// ════════════════════════════════════════════════════════════════
//  Runs on Deno (Supabase Edge Functions). All credential handling is
//  server-side: the API key + secret live in `user_integrations`
//  (service-role only — the browser can NEVER read them, migrations
//  0018 + 0033). The browser only ever sends an action and gets back
//  non-secret status.
//
//  "Bring your own key": each coach connects THEIR OWN invoice account
//  with THEIR OWN key. There is no app-level invoice secret (unlike
//  google-calendar's OAuth client) — nothing to `supabase secrets set`.
//
//  The provider abstraction lives in ./providers.ts — this file is
//  provider-agnostic. connect/test just call verifyCredentials().
//
//  Deploy:  supabase functions deploy invoices
//  (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//   injected automatically. verify_jwt stays ON — we need the caller's
//   identity; the future public webhook is a SEPARATE function.)
//
//  Actions (POST { action, ... }):
//    connect    { provider, api_key, api_secret, environment } → { status }
//    status     { }                                            → { status }
//    test       { }                                            → { ok, status }
//    issue          { transaction_id, doc_type }               → { ok, document }
//    import-approve { import_id }                               → { ok, transaction_id }
//    import-dismiss { import_id }                               → { ok }
//    disconnect     { }                                         → { ok, status }
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getProvider, INVOICE_PROVIDERS, ProviderError } from './providers.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/* Service-role client — bypasses RLS, used for every DB op here. */
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

/* Identify the caller from their JWT (anon client + their Authorization). */
async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return null
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await supa.auth.getUser()
  return user?.id ?? null
}

/* The ONLY shape the browser is allowed to see. NEVER include api_key /
   api_secret here — those are service-role-only. */
const statusOf = (row: any) =>
  row
    ? {
        connected: true, provider: row.provider, environment: row.environment,
        connected_at: row.created_at, auto_import: !!row.auto_import,
        // Invoice business type (עוסק פטור 'exempt' / עוסק מורשה 'licensed' / null
        // = not set) — drives the doc-type picker. Migration 0053.
        business_type: row.business_type ?? null,
        // Durable "credentials rejected" marker (migration 0038) — drives the
        // UI's reconnect prompt. Cleared on any successful call / reconnect.
        credentials_invalid: !!row.credentials_invalid_at,
        // SUMIT Route B: the user's personal webhook URL to paste into a SUMIT trigger.
        webhook_url: row.provider === 'sumit' && row.webhook_token
          ? `${SUPABASE_URL}/functions/v1/invoice-webhook?t=${row.webhook_token}` : null,
      }
    : { connected: false }

/* Flip the durable "credentials invalid" marker only when it actually changes
   (avoids a needless write on every successful call). */
async function setCredsInvalid(id: string, invalid: boolean, current: string | null) {
  if (invalid && !current) {
    await admin.from('user_integrations').update({ credentials_invalid_at: new Date().toISOString() }).eq('id', id)
  } else if (!invalid && current) {
    await admin.from('user_integrations').update({ credentials_invalid_at: null }).eq('id', id)
  }
}

/* The user's single invoice connection (they pick one provider). Scoped to
   invoice providers so the google_calendar row is never touched. */
async function loadInvoiceIntegration(userId: string) {
  const { data } = await admin.from('user_integrations')
    .select('*').eq('user_id', userId).in('provider', INVOICE_PROVIDERS)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

// ── HTTP entry ──────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const userId = await getUserId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)
    const body = await req.json().catch(() => ({}))
    const action = body.action

    if (action === 'connect') {
      const provider = String(body.provider ?? '')
      const environment = String(body.environment ?? '')
      const api_key = (body.api_key ?? '').toString().trim()
      const api_secret = (body.api_secret ?? '').toString().trim()
      if (!INVOICE_PROVIDERS.includes(provider)) return json({ error: 'unknown_provider' }, 400)
      if (environment !== 'sandbox' && environment !== 'production') return json({ error: 'bad_environment' }, 400)
      if (!api_key) return json({ error: 'missing_api_key' }, 400)
      if (!api_secret) return json({ error: 'missing_api_secret' }, 400)

      // Validate the credentials with a real, read-only call before storing.
      const p = getProvider(provider)
      await p.verifyCredentials({ apiKey: api_key, apiSecret: api_secret, environment: environment as any })

      // One invoice provider per user: clear any prior invoice row first so
      // switching greeninvoice↔sumit never leaves a stale connection behind.
      // Carry over the business type (it describes the user's business, not the
      // provider) so a reconnect doesn't lose it.
      const prior = await loadInvoiceIntegration(userId)
      await admin.from('user_integrations').delete().eq('user_id', userId).in('provider', INVOICE_PROVIDERS)
      const { data: row, error } = await admin.from('user_integrations').insert({
        user_id: userId,
        provider,
        api_key,
        api_secret,
        environment,
        business_type: prior?.business_type ?? null,
        // Income import is ON by default — incoming docs stage in "ייבוא ממתין"
        // for the user's approval (they can turn it off on the card).
        auto_import: true,
        // SUMIT Route B identifies the tenant by an unguessable per-connection
        // token in the webhook URL (no company id / signature in its payload).
        webhook_token: provider === 'sumit' ? crypto.randomUUID() : null,
      }).select('*').single()
      if (error) throw error
      return json({ status: statusOf(row) })
    }

    if (action === 'status') {
      let row = await loadInvoiceIntegration(userId)
      // Backfill a webhook token for SUMIT connections made before Route B
      // existed, so the webhook URL appears without reconnecting.
      if (row && row.provider === 'sumit' && !row.webhook_token) {
        const { data: updated } = await admin.from('user_integrations')
          .update({ webhook_token: crypto.randomUUID() }).eq('id', row.id).select('*').maybeSingle()
        if (updated) row = updated
      }
      return json({ status: statusOf(row) })
    }

    if (action === 'test') {
      const row = await loadInvoiceIntegration(userId)
      if (!row) return json({ error: 'not_connected' }, 400)
      const p = getProvider(row.provider)
      try {
        await p.verifyCredentials({ apiKey: row.api_key, apiSecret: row.api_secret, environment: row.environment })
      } catch (e) {
        if (e instanceof ProviderError && e.code === 'invalid_credentials') await setCredsInvalid(row.id, true, row.credentials_invalid_at)
        throw e
      }
      await setCredsInvalid(row.id, false, row.credentials_invalid_at)
      return json({ ok: true, status: statusOf({ ...row, credentials_invalid_at: null }) })
    }

    if (action === 'catalog') {
      const row = await loadInvoiceIntegration(userId)
      if (!row) return json({ error: 'not_connected' }, 400)
      try {
        const items = await getProvider(row.provider)
          .listItems({ apiKey: row.api_key, apiSecret: row.api_secret, environment: row.environment })
        await setCredsInvalid(row.id, false, row.credentials_invalid_at)
        return json({ items })
      } catch (e) {
        if (e instanceof ProviderError && e.code === 'invalid_credentials') await setCredsInvalid(row.id, true, row.credentials_invalid_at)
        throw e
      }
    }

    if (action === 'set-auto-import') {
      const row = await loadInvoiceIntegration(userId)
      if (!row) return json({ error: 'not_connected' }, 400)
      const { data: updated, error: updErr } = await admin.from('user_integrations')
        .update({ auto_import: !!body.value }).eq('id', row.id).select('*').maybeSingle()
      if (updErr || !updated) throw updErr ?? new Error('auto_import update failed')
      return json({ status: statusOf(updated) })
    }

    if (action === 'set-business-type') {
      const value = String(body.value ?? '')
      if (value !== 'exempt' && value !== 'licensed') return json({ error: 'bad_business_type' }, 400)
      const row = await loadInvoiceIntegration(userId)
      if (!row) return json({ error: 'not_connected' }, 400)
      const { data: updated, error: updErr } = await admin.from('user_integrations')
        .update({ business_type: value }).eq('id', row.id).select('*').maybeSingle()
      // Surface a real failure instead of statusOf(undefined) → a misleading
      // "disconnected" status (e.g. if the column/migration were missing).
      if (updErr || !updated) throw updErr ?? new Error('business_type update failed')
      return json({ status: statusOf(updated) })
    }

    if (action === 'issue') {
      const transaction_id = String(body.transaction_id ?? '')
      const doc_type = String(body.doc_type ?? '')
      if (!transaction_id) return json({ error: 'missing_transaction' }, 400)
      if (!['invoice_receipt', 'receipt', 'invoice'].includes(doc_type)) return json({ error: 'bad_doc_type' }, 400)

      const integ = await loadInvoiceIntegration(userId)
      if (!integ) return json({ error: 'not_connected' }, 400)

      // A VAT-exempt business (עוסק פטור) can only issue a receipt — a tax invoice
      // / חשבונית מס/קבלה is rejected by the provider (GI errorCode 2403). Block it
      // here so the UI shows the clear "pick קבלה" message without a provider round
      // trip (the picker also filters to receipt-only when business_type=exempt).
      if (integ.business_type === 'exempt' && doc_type !== 'receipt') return json({ error: 'doctype_for_business' }, 400)

      // Load the transaction — scoped to the caller (defence in depth atop RLS).
      const { data: tx } = await admin.from('transactions')
        .select('*').eq('id', transaction_id).eq('user_id', userId).is('deleted_at', null).maybeSingle()
      if (!tx) return json({ error: 'transaction_not_found' }, 404)
      if (tx.type !== 'income') return json({ error: 'not_income' }, 400)
      if (tx.invoice_document_id) return json({ error: 'already_issued' }, 409)
      const amount = Number(tx.amount)
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'bad_amount' }, 400)

      // Recipient: a linked client, OR an ad-hoc recipient stored on the tx
      // (issue a receipt for someone who isn't a client — beta 25/06). One of
      // the two must carry a name, else there's no one to bill.
      let customer: { name: string; email: string | null; phone: string | null; taxId: string | null }
      if (tx.client_id) {
        const { data: client } = await admin.from('clients')
          .select('name, email, phone').eq('id', tx.client_id).eq('user_id', userId).maybeSingle()
        if (!client?.name) return json({ error: 'no_client' }, 400)
        customer = { name: client.name, email: client.email, phone: client.phone, taxId: null }
      } else if (tx.recipient_name) {
        customer = { name: tx.recipient_name, email: tx.recipient_email ?? null, phone: tx.recipient_phone ?? null, taxId: tx.recipient_tax_id ?? null }
      } else {
        return json({ error: 'no_client' }, 400)
      }

      // Atomic claim — sets invoice_synced_at as an in-flight marker ONLY if the
      // tx isn't already issued/issuing. Blocks a concurrent double-issue of a
      // real tax document (double-click / retry / two tabs).
      const { data: claimed } = await admin.from('transactions')
        .update({ invoice_synced_at: new Date().toISOString() })
        .eq('id', transaction_id).eq('user_id', userId)
        .is('invoice_document_id', null).is('invoice_synced_at', null)
        .select('id').maybeSingle()
      if (!claimed) return json({ error: 'already_issued' }, 409)

      const provider = getProvider(integ.provider)
      let result
      try {
        result = await provider.createDocument(
          { apiKey: integ.api_key, apiSecret: integ.api_secret, environment: integ.environment },
          {
            docType: doc_type as any,
            amount,
            description: tx.desc || `תשלום — ${customer.name}`,
            itemName: (body.item_name ?? '').toString().trim() || tx.desc || `תשלום — ${customer.name}`,
            itemId: body.item_id ? String(body.item_id) : null,
            // 'cheque' intentionally excluded (removed from the UI; GI hard-requires
            // cheque/bank details we don't collect) — a stray value degrades to 'other'.
            paymentMethod: ['cash', 'bank_transfer', 'credit_card', 'app', 'other'].includes(body.payment_method) ? body.payment_method : 'other',
            customer,
            send: true, // auto-send; the provider only acts if the customer has contact info
            businessType: integ.business_type ?? null, // licensed → price is VAT-inclusive
          },
        )
      } catch (e) {
        // Release the claim so a retry is possible (only while no real doc is recorded).
        await admin.from('transactions').update({ invoice_synced_at: null })
          .eq('id', transaction_id).eq('user_id', userId).is('invoice_document_id', null)
        if (e instanceof ProviderError && e.code === 'invalid_credentials') await setCredsInvalid(integ.id, true, integ.credentials_invalid_at)
        throw e
      }
      // The document was created → credentials are definitely valid.
      await setCredsInvalid(integ.id, false, integ.credentials_invalid_at)

      // Record what was issued. If THIS fails, the real document already exists,
      // so log loudly and still return the number rather than losing it.
      const { error: linkErr } = await admin.from('transactions').update({
        invoice_provider: integ.provider,
        invoice_document_id: result.id,
        invoice_document_number: result.number,
        invoice_document_type: result.type,
        invoice_document_url: result.url,
        invoice_synced_at: new Date().toISOString(),
      }).eq('id', transaction_id).eq('user_id', userId)
      if (linkErr) console.error('invoices issue: document issued but failed to link', result.id, linkErr)

      return json({ ok: true, document: { number: result.number, url: result.url, type: result.type } })
    }

    if (action === 'credit') {
      const transaction_id = String(body.transaction_id ?? '')
      if (!transaction_id) return json({ error: 'missing_transaction' }, 400)

      const integ = await loadInvoiceIntegration(userId)
      if (!integ) return json({ error: 'not_connected' }, 400)

      const { data: tx } = await admin.from('transactions')
        .select('*').eq('id', transaction_id).eq('user_id', userId).is('deleted_at', null).maybeSingle()
      if (!tx) return json({ error: 'transaction_not_found' }, 404)
      if (!tx.invoice_document_id) return json({ error: 'not_issued' }, 400) // nothing to credit
      if (tx.invoice_credited_at) return json({ error: 'already_credited' }, 409)

      // Atomic claim — flip the credited marker first, only if issued & not yet
      // credited, so a concurrent double-credit can't mint two credit documents.
      const { data: claimed } = await admin.from('transactions')
        .update({ invoice_credited_at: new Date().toISOString() })
        .eq('id', transaction_id).eq('user_id', userId)
        .not('invoice_document_id', 'is', null).is('invoice_credited_at', null)
        .select('id').maybeSingle()
      if (!claimed) return json({ error: 'already_credited' }, 409)

      let client = null
      if (tx.client_id) {
        const { data } = await admin.from('clients')
          .select('name, email, phone').eq('id', tx.client_id).eq('user_id', userId).maybeSingle()
        client = data
      }
      // Mirror the issued doc's recipient — a client, or the ad-hoc recipient on the tx.
      const creditCustomer = client?.name
        ? { name: client.name, email: client.email, phone: client.phone, taxId: null }
        : { name: tx.recipient_name ?? '', email: tx.recipient_email ?? null, phone: tx.recipient_phone ?? null, taxId: tx.recipient_tax_id ?? null }

      let result
      try {
        result = await getProvider(integ.provider).createCreditNote(
          { apiKey: integ.api_key, apiSecret: integ.api_secret, environment: integ.environment },
          {
            originalExternalId: tx.invoice_document_id,
            docType: tx.invoice_document_type ?? 'invoice_receipt',
            amount: Number(tx.amount),
            description: tx.desc || '',
            itemName: tx.desc || `זיכוי — ${creditCustomer.name}`.trim(),
            customer: creditCustomer,
            reason: (body.reason ?? '').toString().trim() || 'ביטול / זיכוי',
            businessType: integ.business_type ?? null, // mirror the issued doc's VAT treatment
          },
        )
      } catch (e) {
        // Release the claim so a retry is possible — but ONLY while no credit
        // document was recorded (parity with issue()'s guarded release), so we
        // never reopen a claim once a real credit note exists.
        await admin.from('transactions').update({ invoice_credited_at: null })
          .eq('id', transaction_id).eq('user_id', userId).is('invoice_credit_document_id', null)
        if (e instanceof ProviderError && e.code === 'invalid_credentials') await setCredsInvalid(integ.id, true, integ.credentials_invalid_at)
        throw e
      }
      await setCredsInvalid(integ.id, false, integ.credentials_invalid_at)

      const { error: linkErr } = await admin.from('transactions').update({
        invoice_credited_at: new Date().toISOString(),
        invoice_credit_document_id: result.id,
        invoice_credit_document_number: result.number,
        invoice_credit_document_url: result.url,
      }).eq('id', transaction_id).eq('user_id', userId)
      if (linkErr) console.error('invoices credit: document issued but failed to link', result.id, linkErr)

      return json({ ok: true, document: { number: result.number, url: result.url } })
    }

    if (action === 'import-approve') {
      const import_id = String(body.import_id ?? '')
      if (!import_id) return json({ error: 'missing_import' }, 400)
      // Atomic claim: flip pending->imported FIRST, only if still pending.
      // Blocks a concurrent double-approve from creating duplicate income.
      const { data: imp } = await admin.from('pending_invoice_imports')
        .update({ status: 'imported' })
        .eq('id', import_id).eq('user_id', userId).eq('status', 'pending')
        .select('*').maybeSingle()
      if (!imp) return json({ error: 'already_handled' }, 409)

      // Dedup vs Route A: if this document was already issued from Simplicity,
      // link to that transaction instead of creating a duplicate income row.
      const { data: existingTx } = await admin.from('transactions')
        .select('id').eq('user_id', userId).eq('invoice_provider', imp.provider)
        .eq('invoice_document_id', imp.external_document_id).is('deleted_at', null).maybeSingle()
      if (existingTx) {
        await admin.from('pending_invoice_imports').update({ created_transaction_id: existingTx.id }).eq('id', import_id).eq('user_id', userId)
        return json({ ok: true, transaction_id: existingTx.id, deduped: true })
      }

      const descName = imp.customer_name ? ` — ${imp.customer_name}` : ''
      const { data: tx, error: txErr } = await admin.from('transactions').insert({
        user_id: userId,
        type: 'income',
        amount: imp.amount ?? 0,
        desc: `חשבונית ${imp.document_number ?? ''}${descName}`.trim(),
        date: imp.doc_date ?? new Date().toISOString().slice(0, 10),
        status: 'confirmed',
        client_id: imp.client_id,
        invoice_provider: imp.provider,
        invoice_document_id: imp.external_document_id,
        invoice_document_number: imp.document_number,
        invoice_document_type: imp.document_type,
        invoice_document_url: imp.document_url,
        invoice_synced_at: new Date().toISOString(),
      }).select('id').single()
      if (txErr) {
        // Roll the claim back so the user can retry.
        await admin.from('pending_invoice_imports').update({ status: 'pending', created_transaction_id: null }).eq('id', import_id).eq('user_id', userId)
        throw txErr
      }
      await admin.from('pending_invoice_imports')
        .update({ created_transaction_id: tx.id }).eq('id', import_id).eq('user_id', userId)
      return json({ ok: true, transaction_id: tx.id })
    }

    if (action === 'import-dismiss') {
      const import_id = String(body.import_id ?? '')
      if (!import_id) return json({ error: 'missing_import' }, 400)
      await admin.from('pending_invoice_imports')
        .update({ status: 'dismissed' }).eq('id', import_id).eq('user_id', userId).eq('status', 'pending')
      return json({ ok: true })
    }

    if (action === 'disconnect') {
      await admin.from('user_integrations').delete().eq('user_id', userId).in('provider', INVOICE_PROVIDERS)
      return json({ ok: true, status: { connected: false } })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    // Map known provider failures to a coarse, safe code; log full detail
    // server-side only (it can embed the upstream response body).
    if (e instanceof ProviderError) {
      console.error('invoices provider error:', e.code, e.message)
      // `detail` is a sanitized one-liner (the provider's own errorMessage for
      // the user's account) — safe to surface so a failed issuance is actionable.
      return json({ error: e.code, ...(e.detail ? { detail: e.detail } : {}) }, e.code === 'invalid_credentials' ? 400 : 502)
    }
    console.error('invoices error:', e)
    return json({ error: 'request_failed' }, 500)
  }
})
