// ════════════════════════════════════════════════════════════════
//  invoice-webhook — PUBLIC endpoint for Route B (SUMIT first).
// ════════════════════════════════════════════════════════════════
//  A SUMIT "trigger" (Create on a documents View) POSTs here when the
//  user issues a document in SUMIT. We stage a "pending import" the user
//  approves in-app, which becomes an income transaction.
//
//  PUBLIC — deploy with:  supabase functions deploy invoice-webhook --no-verify-jwt
//  (it carries no user JWT; SUMIT just POSTs to a URL).
//
//  Tenant identity + trust model (SUMIT gives NO company id and NO
//  signature in the trigger body):
//    • Each SUMIT connection has an unguessable `webhook_token`. The URL
//      is .../invoice-webhook?t=<token>; the token maps to the user.
//    • We NEVER trust the body's numbers — we take only the document id
//      (EntityID) and RE-FETCH the document via the user's own API creds
//      (getdetails). A spoofed body can at most reference the user's own
//      real documents.
//    • Always ACK 200 fast: SUMIT retries, then PAUSES the trigger after
//      5 non-200 responses. So every path returns 200 (failures logged).
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getProvider } from '../invoices/providers.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const ok = () => new Response('ok', { status: 200 })

/* The document id (SUMIT EntityID) out of a trigger body whose shape is
   the user's View columns. Be liberal about casing / light nesting. */
function extractEntityId(body: any): string | null {
  if (!body || typeof body !== 'object') return null
  for (const c of [body.EntityID, body.entityId, body.entityID, body.ID, body.Id, body.id, body.DocumentID]) {
    if (c != null && String(c).trim()) return String(c).trim()
  }
  for (const k of ['Data', 'data', 'Card', 'card', 'Entity', 'entity']) {
    const v = body[k]
    if (v && typeof v === 'object') { const r = extractEntityId(v); if (r) return r }
  }
  return null
}

/* Best-effort exact-name match to a client (niqqud-stripped, case-insensitive). */
function matchClient(clients: { id: string; name: string }[], name: string | null): string | null {
  if (!name) return null
  const norm = (s: string) => (s ?? '').toString().toLowerCase().normalize('NFKD').replace(/[֑-ׇ]/g, '').trim()
  const n = norm(name)
  if (!n) return null
  return clients.find((c) => norm(c.name) === n)?.id ?? null
}

Deno.serve(async (req) => {
  try {
    const token = new URL(req.url).searchParams.get('t')
    if (!token) return ok()

    // Map token → connection (webhook_token is service-role-only).
    const { data: integ } = await admin.from('user_integrations')
      .select('*').eq('webhook_token', token).maybeSingle()
    if (!integ) return ok() // unknown token → silently ack

    const body = await req.json().catch(() => ({}))
    const entityId = extractEntityId(body)
    if (!entityId) { console.warn('invoice-webhook: no EntityID in body'); return ok() }

    // Dedup: skip if we issued this document (Route A) or already staged it.
    const { data: issued } = await admin.from('transactions')
      .select('id').eq('user_id', integ.user_id).eq('invoice_document_id', entityId).maybeSingle()
    if (issued) return ok()
    const { data: staged } = await admin.from('pending_invoice_imports')
      .select('id').eq('user_id', integ.user_id).eq('provider', integ.provider).eq('external_document_id', entityId).maybeSingle()
    if (staged) return ok()

    // Authoritative details — re-fetch with the user's own credentials.
    let doc
    try {
      doc = await getProvider(integ.provider).fetchDocument(
        { apiKey: integ.api_key, apiSecret: integ.api_secret, environment: integ.environment }, entityId)
    } catch (e) { console.error('invoice-webhook fetch failed:', e); return ok() }
    if (!doc || !doc.docType) return ok() // not found, or a type we don't import as income

    // Best-effort client match by customer name.
    const { data: clients } = await admin.from('clients')
      .select('id, name').eq('user_id', integ.user_id).is('deleted_at', null)
    const clientId = matchClient((clients ?? []) as any, doc.customerName)

    // Stage it (unique constraint backstops a racy double-insert).
    await admin.from('pending_invoice_imports').insert({
      user_id: integ.user_id,
      provider: integ.provider,
      external_document_id: doc.externalId,
      document_type: doc.docType,
      document_number: doc.number,
      amount: doc.amount,
      currency: doc.currency,
      doc_date: doc.date,
      customer_name: doc.customerName,
      document_url: doc.url,
      client_id: clientId,
      status: 'pending',
      raw: doc.raw,
    })
    return ok()
  } catch (e) {
    console.error('invoice-webhook error:', e)
    return ok() // never let SUMIT see a non-200 (it pauses the trigger after 5)
  }
})
