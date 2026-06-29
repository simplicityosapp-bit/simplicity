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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

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

    await approveTransaction(integ, { processId: processId ?? pr.grow_process_id, processToken: processToken ?? pr.grow_process_token })
    return ok()
  } catch (e) {
    console.error('grow-webhook error:', e)
    // Ack anyway — a 500 makes Grow retry forever; reconciliation handles gaps.
    return ok()
  }
})
