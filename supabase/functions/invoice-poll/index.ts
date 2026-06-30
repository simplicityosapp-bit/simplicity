// ════════════════════════════════════════════════════════════════
//  invoice-poll — Route B by polling (Green Invoice + SUMIT).
// ════════════════════════════════════════════════════════════════
//  A scheduled job (pg_cron → net.http_post) calls this. For each
//  import-enabled connection it lists documents created since the last
//  poll and stages them as pending imports for the user's approval — so
//  the user's key+secret alone are enough (no per-user webhook/trigger).
//
//  Deploy:  supabase functions deploy invoice-poll --no-verify-jwt
//  Secret:  supabase secrets set POLL_SECRET=<random>   (the cron must send it)
//  Schedule (run in SQL, with YOUR service key + the same secret):
//    select cron.schedule('invoice-poll','*/15 * * * *', $$
//      select net.http_post(
//        url := 'https://rdurkakzyymxhocvhufw.supabase.co/functions/v1/invoice-poll?s=<POLL_SECRET>',
//        headers := '{"Content-Type":"application/json"}'::jsonb) $$);
//
//  Auth: a shared POLL_SECRET (?s= or x-poll-secret) — the function is
//  public (no JWT) but only the holder of the secret can trigger a poll.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getProvider } from '../invoices/providers.ts'

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

// Providers polled for incoming documents (so the key+secret alone are enough —
// no per-user webhook/trigger). Both providers expose a documents-list API.
const POLL_PROVIDERS = ['greeninvoice', 'sumit']

Deno.serve(async (req) => {
  const secret = new URL(req.url).searchParams.get('s') ?? req.headers.get('x-poll-secret')
  if (!POLL_SECRET || secret !== POLL_SECRET) return json({ error: 'unauthorized' }, 401)

  const { data: integs } = await admin.from('user_integrations').select('*').in('provider', POLL_PROVIDERS)
  let staged = 0, scanned = 0
  for (const integ of (integs ?? [])) {
    // Two gates (migration 0077):
    //   • auto_import   — the income-import switch (also drives the webhook).
    //   • scheduled_scan — opt-in periodic polling. OFF by default so a
    //     connected webhook isn't double-scanned and per-call API charges
    //     don't accrue. Only connections the user explicitly opted into the
    //     (daily) scan are polled here. (undefined when the column predates
    //     the migration → treated as OFF, the safe direction.)
    if (!integ.auto_import || !integ.scheduled_scan) continue
    try {
      const since = integ.last_polled_at ?? new Date(Date.now() - 7 * 86400000).toISOString()
      const docs = await getProvider(integ.provider).listDocumentsSince(
        { apiKey: integ.api_key, apiSecret: integ.api_secret, environment: integ.environment }, since)
      scanned += docs.length
      const { data: clients } = await admin.from('clients').select('id, name').eq('user_id', integ.user_id).is('deleted_at', null)
      for (const doc of docs) {
        if (!doc.docType || !(Number(doc.amount) > 0)) continue
        // Dedup vs Route A and prior imports.
        const { data: issued } = await admin.from('transactions')
          .select('id').eq('user_id', integ.user_id).eq('invoice_provider', integ.provider).eq('invoice_document_id', doc.externalId).maybeSingle()
        if (issued) continue
        const { data: stagedRow } = await admin.from('pending_invoice_imports')
          .select('id').eq('user_id', integ.user_id).eq('provider', integ.provider).eq('external_document_id', doc.externalId).maybeSingle()
        if (stagedRow) continue
        const clientId = matchClient((clients ?? []) as any, doc.customerName)

        // Always stage for the user's approval (never silently record income).
        const { error } = await admin.from('pending_invoice_imports').upsert({
          user_id: integ.user_id, provider: integ.provider, external_document_id: doc.externalId,
          document_type: doc.docType, document_number: doc.number, amount: doc.amount, currency: doc.currency,
          doc_date: doc.date, customer_name: doc.customerName, document_url: doc.url, client_id: clientId,
          status: 'pending', raw: doc.raw,
        }, { onConflict: 'user_id,provider,external_document_id', ignoreDuplicates: true })
        if (!error) staged++
        else console.error('invoice-poll stage failed', error)
      }
      await admin.from('user_integrations').update({ last_polled_at: new Date().toISOString() }).eq('id', integ.id)
    } catch (e) {
      console.error('invoice-poll: connection failed', integ.id, e)
    }
  }
  return json({ ok: true, connections: (integs ?? []).length, scanned, staged })
})
