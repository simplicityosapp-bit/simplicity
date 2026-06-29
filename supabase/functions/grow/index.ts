// ════════════════════════════════════════════════════════════════
//  grow — connect the Grow (גרו / Meshulam) payment gateway
// ════════════════════════════════════════════════════════════════
//  Phase 1: connect / status / test / disconnect only. Payment links +
//  the payment-received callback land in later phases (the callback will
//  be a SEPARATE --no-verify-jwt function, identifying the tenant by an
//  unguessable webhook_token — same pattern as invoice-webhook).
//
//  "Bring your own key": each coach connects THEIR OWN Grow account with
//  THEIR OWN userId + pageCode + apiKey. Credentials live in
//  user_integrations (service-role only — the browser NEVER reads them,
//  migrations 0018 + 0033 + 0060). The browser only sends an action and
//  gets back non-secret status.
//
//  Credential columns (migration 0060):
//      api_key    = Grow userId    (business identifier)
//      api_secret = Grow apiKey    (the sensitive key)
//      page_code  = Grow pageCode  (payment-page config id)
//
//  Deploy:  supabase functions deploy grow
//  (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//   injected automatically. verify_jwt stays ON — we need the caller's
//   identity; the future public callback is a SEPARATE function.)
//
//  Actions (POST { action, ... }):
//    connect    { userId, pageCode, apiKey, environment } → { status }
//    status     { }                                       → { status }
//    test       { }                                       → { ok, status }
//    disconnect { }                                       → { ok, status }
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { gateway, GrowError } from './gateway.ts'

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

const PROVIDER = 'grow'

/* The ONLY shape the browser is allowed to see. NEVER include the Grow
   userId / pageCode / apiKey — those are service-role-only. */
const statusOf = (row: any) =>
  row
    ? {
        connected: true,
        provider: row.provider,
        environment: row.environment,
        connected_at: row.created_at,
        // Durable "credentials rejected" marker (migration 0038) — drives the
        // UI's reconnect prompt. Cleared on any successful call / reconnect.
        credentials_invalid: !!row.credentials_invalid_at,
        // Opt-in: auto-issue a receipt via the invoice provider on payment (0063).
        auto_receipt: !!row.grow_auto_receipt,
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

/* The user's single Grow connection. Scoped to provider='grow' so the
   google_calendar / invoice rows are never touched. */
async function loadGrowIntegration(userId: string) {
  const { data } = await admin.from('user_integrations')
    .select('*').eq('user_id', userId).eq('provider', PROVIDER)
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
      const environment = String(body.environment ?? '')
      const growUserId = (body.userId ?? '').toString().trim()
      const pageCode = (body.pageCode ?? '').toString().trim()
      const apiKey = (body.apiKey ?? '').toString().trim()
      if (environment !== 'sandbox' && environment !== 'production') return json({ error: 'bad_environment' }, 400)
      if (!growUserId) return json({ error: 'missing_user_id' }, 400)
      if (!pageCode) return json({ error: 'missing_page_code' }, 400)
      if (!apiKey) return json({ error: 'missing_api_key' }, 400)

      // Validate the credentials with a real call before storing.
      await gateway.verifyCredentials({ userId: growUserId, pageCode, apiKey, environment })

      // One Grow connection per user: clear any prior Grow row first so a
      // reconnect never leaves a stale connection behind.
      await admin.from('user_integrations').delete().eq('user_id', userId).eq('provider', PROVIDER)
      const { data: row, error } = await admin.from('user_integrations').insert({
        user_id: userId,
        provider: PROVIDER,
        api_key: growUserId,   // column api_key   ← Grow userId
        page_code: pageCode,   // column page_code ← Grow pageCode
        api_secret: apiKey,    // column api_secret← Grow apiKey (sensitive)
        environment,
        // Per-connection token that identifies the tenant in the grow-webhook
        // URL (notifyUrl) — the public callback has no auth header.
        webhook_token: crypto.randomUUID(),
      }).select('*').single()
      if (error) throw error
      return json({ status: statusOf(row) })
    }

    if (action === 'status') {
      const row = await loadGrowIntegration(userId)
      return json({ status: statusOf(row) })
    }

    if (action === 'test') {
      const row = await loadGrowIntegration(userId)
      if (!row) return json({ error: 'not_connected' }, 400)
      try {
        await gateway.verifyCredentials({ userId: row.api_key, pageCode: row.page_code, apiKey: row.api_secret, environment: row.environment })
      } catch (e) {
        if (e instanceof GrowError && e.code === 'invalid_credentials') await setCredsInvalid(row.id, true, row.credentials_invalid_at)
        throw e
      }
      await setCredsInvalid(row.id, false, row.credentials_invalid_at)
      return json({ ok: true, status: statusOf({ ...row, credentials_invalid_at: null }) })
    }

    if (action === 'create-payment-link') {
      const row = await loadGrowIntegration(userId)
      if (!row) return json({ error: 'not_connected' }, 400)
      const source = String(body.source ?? '')
      if (!['client', 'transaction', 'installment'].includes(source)) return json({ error: 'bad_source' }, 400)
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'bad_amount' }, 400)
      const clientId = body.client_id ? String(body.client_id) : null
      const transactionId = body.transaction_id ? String(body.transaction_id) : null
      const installmentId = body.installment_id ? String(body.installment_id) : null
      const description = (body.description ?? '').toString().trim().slice(0, 200) || 'תשלום'

      // Validate ownership of every referenced record (defence in depth) — never
      // store a foreign id, so the webhook can trust pr's references blindly.
      if (clientId) {
        const { data: c } = await admin.from('clients').select('id').eq('id', clientId).eq('user_id', userId).maybeSingle()
        if (!c) return json({ error: 'client_not_found' }, 404)
      }
      if (transactionId) {
        const { data: txOwn } = await admin.from('transactions').select('id').eq('id', transactionId).eq('user_id', userId).is('deleted_at', null).maybeSingle()
        if (!txOwn) return json({ error: 'transaction_not_found' }, 404)
      }
      if (installmentId) {
        const { data: inst } = await admin.from('payment_installments').select('plan_id').eq('id', installmentId).maybeSingle()
        const { data: pl } = inst?.plan_id
          ? await admin.from('payment_plans').select('user_id').eq('id', inst.plan_id).maybeSingle()
          : { data: null }
        if (!pl || pl.user_id !== userId) return json({ error: 'installment_not_found' }, 404)
      }

      // Customer details for the Grow page (best-effort, scoped to the caller).
      let customer = { name: 'לקוח', phone: null as string | null, email: null as string | null }
      if (clientId) {
        const { data: c } = await admin.from('clients').select('name, phone, email').eq('id', clientId).eq('user_id', userId).maybeSingle()
        if (c) customer = { name: c.name ?? 'לקוח', phone: c.phone ?? null, email: c.email ?? null }
      }

      // Ensure a webhook token exists (backfill for pre-existing connections).
      let token = row.webhook_token
      if (!token) {
        const { data: upd } = await admin.from('user_integrations').update({ webhook_token: crypto.randomUUID() }).eq('id', row.id).select('webhook_token').maybeSingle()
        token = upd?.webhook_token
      }

      // Create the pending row first so we have a correlation id for Grow.
      const { data: pr, error: prErr } = await admin.from('payment_requests').insert({
        user_id: userId, client_id: clientId, transaction_id: transactionId, installment_id: installmentId,
        source, amount, description, status: 'pending',
      }).select('*').single()
      if (prErr) throw prErr

      const origin = (body.return_origin ?? '').toString().trim()
      const base = /^https?:\/\//.test(origin) ? origin : 'https://simplicity-os.com'
      const notifyUrl = `${SUPABASE_URL}/functions/v1/grow-webhook?t=${token}`
      let link
      try {
        link = await gateway.createPaymentLink(
          { userId: row.api_key, pageCode: row.page_code, apiKey: row.api_secret, environment: row.environment },
          {
            amount, description,
            customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email,
            successUrl: `${base}/?grow=success`, cancelUrl: `${base}/?grow=cancel`,
            notifyUrl, correlationId: pr.id,
          },
        )
      } catch (e) {
        await admin.from('payment_requests').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', pr.id)
        if (e instanceof GrowError && e.code === 'invalid_credentials') await setCredsInvalid(row.id, true, row.credentials_invalid_at)
        throw e
      }
      await setCredsInvalid(row.id, false, row.credentials_invalid_at)
      await admin.from('payment_requests').update({
        payment_url: link.url, grow_process_id: link.processId, grow_process_token: link.processToken,
        updated_at: new Date().toISOString(),
      }).eq('id', pr.id)
      return json({ ok: true, payment: { id: pr.id, url: link.url } })
    }

    if (action === 'set-auto-receipt') {
      const row = await loadGrowIntegration(userId)
      if (!row) return json({ error: 'not_connected' }, 400)
      const { data: updated, error: updErr } = await admin.from('user_integrations')
        .update({ grow_auto_receipt: !!body.value }).eq('id', row.id).select('*').maybeSingle()
      if (updErr || !updated) throw updErr ?? new Error('auto_receipt update failed')
      return json({ status: statusOf(updated) })
    }

    if (action === 'disconnect') {
      await admin.from('user_integrations').delete().eq('user_id', userId).eq('provider', PROVIDER)
      return json({ ok: true, status: { connected: false } })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    // Map known gateway failures to a coarse, safe code; log full detail
    // server-side only (it can embed the upstream response body).
    if (e instanceof GrowError) {
      console.error('grow gateway error:', e.code, e.message)
      return json({ error: e.code, ...(e.detail ? { detail: e.detail } : {}) }, e.code === 'invalid_credentials' ? 400 : 502)
    }
    console.error('grow error:', e)
    return json({ error: 'request_failed' }, 500)
  }
})
