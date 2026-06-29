// ════════════════════════════════════════════════════════════════
//  grow-webhook — Grow (גרו / Meshulam) payment-received server callback
// ════════════════════════════════════════════════════════════════
//  PUBLIC function (deploy with --no-verify-jwt): Grow's server posts here
//  (the notifyUrl we passed to createPaymentProcess) with no auth header.
//  We identify the tenant by an unguessable per-connection token in the
//  query string (?t=<webhook_token>) — same pattern as invoice-webhook.
//
//  Money rules:
//    • NEVER trust the callback body — re-fetch the authoritative status
//      from Grow (getPaymentProcessInfo) before recording anything.
//    • Record income exactly ONCE (atomic claim on the payment_requests
//      row, deduped by grow_transaction_id) — single source of truth.
//    • Acknowledge with approveTransaction (MANDATORY per Grow).
//
//  Deploy:  supabase functions deploy grow-webhook --no-verify-jwt
//
//  ⚠️ UNVERIFIED end-to-end: the callback field names, the inquiry/approve
//  endpoints and their response envelopes are implemented from the
//  documented Grow API but NOT yet observed against a live account. The
//  whole Grow feature is gated behind GROW_ENABLED in the app, so this is
//  never invoked until a real Grow account verifies the flow.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
// Reuse the invoices function's provider layer (no duplication) to issue the
// auto-receipt — SUMIT is verified there; Green Invoice is documented-but-not.
import { getProvider } from '../invoices/providers.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const INVOICE_PROVIDERS = ['greeninvoice', 'sumit']

/* Opt-in auto-receipt: issue a RECEIPT for a Grow-paid income tx via the coach's
   connected invoice provider, and link the document onto the tx. Skips silently
   when there's no invoice provider, no customer name, or the tx already has a
   document. Atomic claim mirrors the invoices `issue` action's double-issue
   guard. ⚠️ The provider call itself is UNVERIFIED for Grow's flow. */
async function maybeIssueReceipt(userId: string, txId: string, pr: any) {
  const { data: tx } = await admin.from('transactions').select('*').eq('id', txId).eq('user_id', userId).maybeSingle()
  if (!tx || tx.invoice_document_id) return
  const { data: inv } = await admin.from('user_integrations')
    .select('*').eq('user_id', userId).in('provider', INVOICE_PROVIDERS)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (!inv) return // no invoice provider connected → nothing to issue with

  let customer = { name: '', email: null as string | null, phone: null as string | null }
  if (tx.client_id) {
    const { data: c } = await admin.from('clients').select('name,email,phone').eq('id', tx.client_id).maybeSingle()
    if (c) customer = { name: c.name ?? '', email: c.email ?? null, phone: c.phone ?? null }
  } else if (pr?.source === 'booking' && pr?.booking_id) {
    const { data: bk } = await admin.from('bookings').select('name,email,phone').eq('id', pr.booking_id).maybeSingle()
    if (bk) customer = { name: bk.name ?? '', email: bk.email ?? null, phone: bk.phone ?? null }
  }
  if (!customer.name) return // the provider requires a customer name

  // Atomic claim — set invoice_synced_at only if no doc / not in-flight.
  const { data: claimed } = await admin.from('transactions')
    .update({ invoice_synced_at: new Date().toISOString() })
    .eq('id', txId).eq('user_id', userId).is('invoice_document_id', null).is('invoice_synced_at', null)
    .select('id').maybeSingle()
  if (!claimed) return

  try {
    const doc = await getProvider(inv.provider).createDocument(
      { apiKey: inv.api_key, apiSecret: inv.api_secret, environment: inv.environment },
      {
        docType: 'receipt', amount: Number(tx.amount),
        description: tx.desc || 'תשלום', itemName: tx.desc || 'תשלום', itemId: null,
        paymentMethod: 'credit_card', customer, send: true, businessType: inv.business_type ?? null,
      },
    )
    await admin.from('transactions').update({
      invoice_provider: inv.provider, invoice_document_id: doc.id, invoice_document_number: doc.number,
      invoice_document_type: doc.type, invoice_document_url: doc.url, invoice_synced_at: new Date().toISOString(),
    }).eq('id', txId).eq('user_id', userId)
  } catch (e) {
    // Release the claim so a later retry/poll can re-issue (no doc recorded).
    await admin.from('transactions').update({ invoice_synced_at: null })
      .eq('id', txId).eq('user_id', userId).is('invoice_document_id', null)
    throw e
  }
}

const BASE: Record<string, string> = {
  sandbox: 'https://sandbox.meshulam.co.il/api/light/server/1.0',
  production: 'https://secure.meshulam.co.il/api/light/server/1.0',
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()

/* Grow creds carried on the user_integrations row (see grow/index.ts). */
function credsForm(integ: any): FormData {
  const f = new FormData()
  f.append('pageCode', integ.page_code ?? '')
  f.append('userId', integ.api_key ?? '')          // column api_key = Grow userId
  if (integ.api_secret) f.append('apiKey', integ.api_secret) // column api_secret = Grow apiKey
  return f
}

/* Authoritative re-fetch — never trust the callback body. Returns paid + the
   Grow transaction id. Degrades to "not verified" (paid:false) on any error. */
async function getPaymentInfo(integ: any, ref: { processId?: string | null; processToken?: string | null }) {
  try {
    const form = credsForm(integ)
    if (ref.processId) form.append('processId', ref.processId)
    if (ref.processToken) form.append('processToken', ref.processToken)
    const res = await fetch(`${BASE[integ.environment] ?? BASE.production}/getPaymentProcessInfo`, { method: 'POST', body: form })
    if (!res.ok) return { paid: false, transactionId: null as string | null, amount: null as number | null }
    const data = (await res.json().catch(() => ({}))) as any
    const d = data?.data ?? {}
    const txId = d.transactionId ?? d.transactionID ?? d.asmachta ?? null
    const amount = Number.isFinite(Number(d.sum ?? d.amount)) ? Number(d.sum ?? d.amount) : null
    return { paid: data?.status === 1 && !!txId, transactionId: txId != null ? String(txId) : null, amount }
  } catch (_e) {
    return { paid: false, transactionId: null, amount: null }
  }
}

/* Acknowledge to Grow (mandatory). Best-effort. */
async function approveTransaction(integ: any, ref: { processId?: string | null; processToken?: string | null }) {
  try {
    const form = credsForm(integ)
    if (ref.processId) form.append('processId', ref.processId)
    if (ref.processToken) form.append('processToken', ref.processToken)
    await fetch(`${BASE[integ.environment] ?? BASE.production}/approveTransaction`, { method: 'POST', body: form })
  } catch (e) {
    console.error('grow-webhook approveTransaction failed', e)
  }
}

const ok = () => new Response('ok', { status: 200 })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('t')
    if (!token) return new Response('missing token', { status: 400 })

    // Identify the tenant by the unguessable per-connection token.
    const { data: integ } = await admin.from('user_integrations')
      .select('*').eq('provider', 'grow').eq('webhook_token', token).maybeSingle()
    if (!integ) return new Response('unknown', { status: 404 })

    // Parse the callback body — Grow posts form-encoded; tolerate JSON + query.
    let body: Record<string, any> = {}
    try {
      const ct = req.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) body = await req.json()
      else { const fd = await req.formData(); for (const [k, v] of fd.entries()) body[k] = v }
    } catch { /* fall through to query params */ }
    const pick = (...keys: string[]) => {
      for (const k of keys) { if (body[k] != null) return String(body[k]); const q = url.searchParams.get(k); if (q != null) return q }
      return null
    }

    const correlationId = pick('cField1', 'customFields[cField1]', 'cfield1')
    const processId = pick('processId', 'data[processId]')
    const processToken = pick('processToken', 'transactionToken', 'data[processToken]')
    const callbackTxId = pick('transactionId', 'asmachta', 'data[transactionId]')

    if (!correlationId) return ok() // nothing to correlate — ack to stop retries

    const { data: pr } = await admin.from('payment_requests')
      .select('*').eq('id', correlationId).eq('user_id', integ.user_id).maybeSingle()
    if (!pr) return ok()
    if (pr.status === 'paid') { await approveTransaction(integ, { processId: pr.grow_process_id, processToken: pr.grow_process_token }); return ok() }

    // Authoritative verification — never trust the body for money.
    const info = await getPaymentInfo(integ, {
      processId: processId ?? pr.grow_process_id,
      processToken: processToken ?? pr.grow_process_token,
    })
    if (!info.paid) return ok() // not paid (yet) — ack; a later callback/poll will catch it

    const growTxId = info.transactionId ?? (callbackTxId ? String(callbackTxId) : null)

    // Atomic claim: flip pending → paid only if still pending. Blocks a retried
    // callback from double-recording income.
    const { data: claimed } = await admin.from('payment_requests')
      .update({ status: 'paid', grow_transaction_id: growTxId, paid_at: nowISO(), updated_at: nowISO() })
      .eq('id', pr.id).eq('user_id', integ.user_id).eq('status', 'pending')
      .select('id').maybeSingle()
    if (!claimed) { await approveTransaction(integ, { processId, processToken }); return ok() } // already handled

    // Record income — context-aware per source (decision #7).
    try {
      if (pr.source === 'client') {
        const { data: tx } = await admin.from('transactions').insert({
          user_id: integ.user_id, type: 'income', amount: pr.amount,
          desc: pr.description || 'תשלום בכרטיס אשראי', date: todayISO(), status: 'confirmed',
          client_id: pr.client_id, payment_method: 'credit_card',
        }).select('id').single()
        if (tx) await admin.from('payment_requests').update({ transaction_id: tx.id, updated_at: nowISO() }).eq('id', pr.id)
      } else if (pr.source === 'transaction' && pr.transaction_id) {
        // The income tx already exists (a pending/expected income) — confirm it
        // and tag the method; do NOT create a second income row.
        await admin.from('transactions').update({ status: 'confirmed', payment_method: 'credit_card' })
          .eq('id', pr.transaction_id).eq('user_id', integ.user_id)
      } else if (pr.source === 'installment' && pr.installment_id) {
        // Mirror usePaymentPlans.markReceived server-side: create the linked
        // income tx, then flag the installment received.
        const { data: tx } = await admin.from('transactions').insert({
          user_id: integ.user_id, type: 'income', amount: pr.amount,
          desc: pr.description || 'תשלום בכרטיס אשראי', date: todayISO(), status: 'confirmed',
          client_id: pr.client_id, payment_method: 'credit_card',
        }).select('id').single()
        await admin.from('payment_installments').update({
          received: true, received_date: todayISO(), payment_method: 'credit_card', transaction_id: tx?.id ?? null,
        }).eq('id', pr.installment_id)
        if (tx) await admin.from('payment_requests').update({ transaction_id: tx.id, updated_at: nowISO() }).eq('id', pr.id)
      } else if (pr.source === 'booking' && pr.booking_id) {
        // Pay-at-booking: payment secures the slot — clear the TTL hold so the
        // booking is now a permanent pending row (the coach confirms it as
        // usual, which creates the lead + calendar event). Then record income.
        await admin.from('bookings').update({ payment_status: 'paid', payment_deadline: null })
          .eq('id', pr.booking_id).eq('user_id', integ.user_id)
        const { data: tx } = await admin.from('transactions').insert({
          user_id: integ.user_id, type: 'income', amount: pr.amount,
          desc: pr.description || 'תשלום עבור פגישה', date: todayISO(), status: 'confirmed',
          client_id: pr.client_id, payment_method: 'credit_card',
        }).select('id').single()
        if (tx) await admin.from('payment_requests').update({ transaction_id: tx.id, updated_at: nowISO() }).eq('id', pr.id)
      }
    } catch (e) {
      // The payment is real and claimed — log loudly, still ack so Grow stops
      // retrying; reconciliation (Phase 4 polling) can repair a missed record.
      console.error('grow-webhook: paid but failed to record income', pr.id, e)
    }

    // Opt-in: auto-issue a receipt for the recorded income via the connected
    // invoice provider. Separate try — a receipt failure must never block the
    // mandatory ack below (the income is already recorded).
    if (integ.grow_auto_receipt) {
      try {
        const { data: prNow } = await admin.from('payment_requests').select('transaction_id').eq('id', pr.id).maybeSingle()
        if (prNow?.transaction_id) await maybeIssueReceipt(integ.user_id, prNow.transaction_id, pr)
      } catch (e) { console.error('grow-webhook auto-receipt failed', pr.id, e) }
    }

    await approveTransaction(integ, { processId: processId ?? pr.grow_process_id, processToken: processToken ?? pr.grow_process_token })
    return ok()
  } catch (e) {
    console.error('grow-webhook error:', e)
    // Ack anyway — a 500 makes Grow retry forever; reconciliation handles gaps.
    return ok()
  }
})
