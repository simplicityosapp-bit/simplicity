// ════════════════════════════════════════════════════════════════
//  grow-poll — import external Grow charges (Phase 4, part B).
// ════════════════════════════════════════════════════════════════
//  A scheduled job (pg_cron → net.http_post) calls this. For each
//  import-enabled Grow connection it lists charges since the last poll and
//  STAGES the ones not already in the books as pending imports for the
//  coach's approval — so charges made outside Simplicity (Grow dashboard,
//  POS, other links) are caught too, without ever silently recording income.
//
//  Dedup: a charge whose grow_transaction_id already maps to a transaction
//  (our own webhook-recorded payments + prior approvals) is skipped, as is
//  one already staged. So a Grow payment created from Simplicity is never
//  double-counted.
//
//  Deploy:  supabase functions deploy grow-poll --no-verify-jwt
//  Secret:  supabase secrets set POLL_SECRET=<random>  (shared with invoice-poll)
//  Schedule (SQL, with your service key + the same secret):
//    select cron.schedule('grow-poll','*/30 * * * *', $$
//      select net.http_post(
//        url := 'https://rdurkakzyymxhocvhufw.supabase.co/functions/v1/grow-poll?s=<POLL_SECRET>',
//        headers := '{"Content-Type":"application/json"}'::jsonb) $$);
//
//  ⚠️ UNVERIFIED: gateway.listTransactionsSince hits a best-guess Grow
//  transactions-list endpoint — calibrate against a live account before
//  enabling. Dormant until POLL_SECRET + the cron schedule are set AND a
//  coach turns grow_import_enabled on (default OFF).
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { gateway } from '../grow/gateway.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const POLL_SECRET = Deno.env.get('POLL_SECRET') ?? ''
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

/* Best-effort exact-name match to a client (niqqud-stripped, case-insensitive). */
function matchClient(clients: { id: string; name: string }[], name: string | null): string | null {
  if (!name) return null
  const norm = (s: string) => (s ?? '').toString().toLowerCase().normalize('NFKD').replace(/[֑-ׇ]/g, '').trim()
  const n = norm(name)
  if (!n) return null
  return clients.find((c) => norm(c.name) === n)?.id ?? null
}

Deno.serve(async (req) => {
  const secret = new URL(req.url).searchParams.get('s') ?? req.headers.get('x-poll-secret')
  if (!POLL_SECRET || secret !== POLL_SECRET) return json({ error: 'unauthorized' }, 401)

  const { data: integs } = await admin.from('user_integrations').select('*').eq('provider', 'grow')
  let staged = 0, scanned = 0
  for (const integ of (integs ?? [])) {
    // External-charge import is opt-in: only poll connections the coach enabled.
    if (!integ.grow_import_enabled) continue
    try {
      const since = integ.last_polled_at ?? new Date(Date.now() - 7 * 86400000).toISOString()
      const charges = await gateway.listTransactionsSince(
        { userId: integ.api_key, pageCode: integ.page_code, apiKey: integ.api_secret, environment: integ.environment }, since)
      scanned += charges.length
      const { data: clients } = await admin.from('clients').select('id, name').eq('user_id', integ.user_id).is('deleted_at', null)
      for (const ch of charges) {
        if (!ch.transactionId || !(Number(ch.amount) > 0)) continue
        // Dedup vs already-recorded income (our own payments + prior approvals).
        const { data: tx } = await admin.from('transactions')
          .select('id').eq('user_id', integ.user_id).eq('grow_transaction_id', ch.transactionId).maybeSingle()
        if (tx) continue
        const { data: pend } = await admin.from('pending_grow_imports')
          .select('id').eq('user_id', integ.user_id).eq('grow_transaction_id', ch.transactionId).maybeSingle()
        if (pend) continue
        const clientId = matchClient((clients ?? []) as any, ch.customerName)
        // Always stage for approval — never silently record income.
        const { error } = await admin.from('pending_grow_imports').upsert({
          user_id: integ.user_id, grow_transaction_id: ch.transactionId, amount: ch.amount, currency: ch.currency,
          charge_date: ch.date, customer_name: ch.customerName, client_id: clientId, status: 'pending', raw: ch.raw,
        }, { onConflict: 'user_id,grow_transaction_id', ignoreDuplicates: true })
        if (!error) staged++
        else console.error('grow-poll stage failed', error)
      }
      await admin.from('user_integrations').update({ last_polled_at: new Date().toISOString() }).eq('id', integ.id)
    } catch (e) {
      console.error('grow-poll: connection failed', integ.id, e)
    }
  }
  return json({ ok: true, connections: (integs ?? []).length, scanned, staged })
})
