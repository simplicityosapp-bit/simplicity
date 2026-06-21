// ════════════════════════════════════════════════════════════════
//  lead-intake — PUBLIC endpoint for Lead Pages (/lead/<id>).
// ════════════════════════════════════════════════════════════════
//  The single public surface for lead-capture landing pages. The public
//  page NEVER touches the DB directly — it talks only to this function,
//  which holds the service role:
//
//    • GET  ?page=<id>  → the published page's PUBLIC config (content +
//      fields). 404 if missing / unpublished / deleted. The internal
//      `title` and `auto_approve` are never exposed.
//    • POST {page, answers} → validate required fields, map builtin
//      answers → leads columns and free answers → leads.data, then
//      insert a lead for the PAGE'S user_id (never client-supplied).
//      Lands as pending_review unless the page opted into auto-approve.
//
//  PUBLIC — deploy with:
//      supabase functions deploy lead-intake --no-verify-jwt
//  (the page carries no user JWT — anyone on the internet can POST.)
//
//  Trust model:
//    • user_id comes ONLY from the page row (looked up by page id with
//      the service role). A submitter can never forge it.
//    • The page id is an unguessable uuid; an unpublished page 404s.
//    • Required-field validation + length/size caps are enforced here,
//      not trusted from the client.
//    • Per-IP rate limit blunts spam floods. No CAPTCHA in v1 (future);
//      a honeypot field silently drops bots.
//
//  Field mapping MIRRORS src/lib/leadPageSchema.js BUILTIN_COLUMN —
//  keep the two in sync.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/* builtin field key → leads column. MIRRORS leadPageSchema.js. */
const BUILTIN_COLUMN: Record<string, string> = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  note: 'notes',
}

const MAX_FIELDS = 50
const MAX_ANSWER_LEN = 2000

/* ── Rate limiting (best-effort, per warm isolate) ────────────────────
   Public POST → guard against floods. In-memory, resets on cold start,
   not shared across isolates — the honest tradeoff for a stateless edge
   function. A real visitor submits once, far under the cap. */
const RL = new Map<string, number[]>()
function overLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (RL.get(key) ?? []).filter((t) => now - t < windowMs)
  arr.push(now)
  RL.set(key, arr)
  if (RL.size > 10_000) RL.clear()
  return arr.length > max
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim()

/* Strip a page row down to what the public page may see. */
function publicConfig(page: any) {
  return {
    id: page.id,
    content: page.content ?? {},
    fields: Array.isArray(page.fields) ? page.fields : [],
  }
}

async function loadPublishedPage(pageId: string) {
  if (!pageId) return null
  const { data, error } = await admin
    .from('lead_pages')
    .select('*')
    .eq('id', pageId)
    .eq('published', true)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) { console.error('lead-intake load error:', error); return null }
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'

  try {
    // ── GET: serve the published page config ──────────────────────────
    if (req.method === 'GET') {
      if (overLimit(`get:${ip}`, 120, 60_000)) return json({ error: 'rate_limited' }, 429)
      const url = new URL(req.url)
      const page = await loadPublishedPage(str(url.searchParams.get('page')))
      if (!page) return json({ error: 'not_found' }, 404)
      return json(publicConfig(page))
    }

    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    // ── POST: accept a submission ─────────────────────────────────────
    if (overLimit(`post:${ip}`, 20, 60_000)) return json({ error: 'rate_limited' }, 429)

    const body = await req.json().catch(() => ({}))
    const page = await loadPublishedPage(str(body?.page))
    if (!page) return json({ error: 'not_found' }, 404)

    const answers = (body?.answers && typeof body.answers === 'object') ? body.answers : {}

    // Honeypot: a hidden field bots fill in. Silently pretend success.
    if (str(answers._hp)) return json({ ok: true, thankYou: page.content?.thankYou ?? null })

    const fields = Array.isArray(page.fields) ? page.fields : []

    // Required-field validation (server-authoritative).
    for (const f of fields) {
      if (f?.required && !str(answers[f.key])) {
        return json({ error: 'missing_required', field: f.key }, 400)
      }
    }

    // Map answers → columns (builtin) + data (free). Only fields the page
    // actually declares are accepted; unknown keys are ignored.
    const row: Record<string, unknown> = {
      user_id: page.user_id,
      page_id: page.id,
      // Leads inherit the page's project so the data is attributed correctly.
      project_id: page.project_id ?? null,
      status: 'new',
      status_meta: 'in_process',
      pending_review: !page.auto_approve,
      data: {},
    }
    const data: Record<string, string> = {}
    let count = 0
    for (const f of fields) {
      if (count >= MAX_FIELDS) break       // hard cap reached — stop
      if (!f?.key) continue                // skip a malformed field, keep going
      const val = str(answers[f.key]).slice(0, MAX_ANSWER_LEN)
      if (!val) continue
      count += 1
      const col = BUILTIN_COLUMN[f.key]
      if (col) row[col] = val
      else data[f.key] = val
    }
    row.data = data

    // leads.name is NOT NULL — guarantee a value even if the page made the
    // name field optional (or removed it) and the visitor left it blank.
    if (!str(row.name)) {
      row.name = str(row.phone) || str(row.email) || 'פנייה מהדף'
    }

    const today = new Date().toISOString().slice(0, 10)
    row.inquiry_date = today

    const { error } = await admin.from('leads').insert(row)
    if (error) {
      console.error('lead-intake insert error:', error)
      return json({ error: 'insert_failed' }, 500)
    }

    return json({ ok: true, thankYou: page.content?.thankYou ?? null })
  } catch (e) {
    console.error('lead-intake error:', e)
    return json({ error: 'internal_error' }, 500)
  }
})
