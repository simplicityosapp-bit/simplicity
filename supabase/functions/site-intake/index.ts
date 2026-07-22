// ════════════════════════════════════════════════════════════════
//  site-intake — PUBLIC endpoint for page-builder pages (/p/<id>).
// ════════════════════════════════════════════════════════════════
//  The single public surface for unified builder pages (site_pages). The
//  public page NEVER touches the DB directly — it talks only to this
//  function, which holds the service role:
//
//    • GET  ?page=<id|slug> → the published page's PUBLIC config
//      (kind + theme + sections + config). 404 if missing / unpublished /
//      deleted. The internal `title` is never exposed.
//    • POST {page, section, answers} → find the form SECTION, validate its
//      required fields, map builtin answers → leads columns and free
//      answers → leads.data, then insert a lead for the PAGE'S user_id
//      (never client-supplied). Lands as pending_review unless the form /
//      page opted into auto-approve.
//
//  PUBLIC — deploy with:
//      supabase functions deploy site-intake --no-verify-jwt
//
//  Trust model mirrors lead-intake: user_id comes ONLY from the page row;
//  required-field validation + length caps are enforced here; a per-IP rate
//  limit blunts floods; a honeypot field silently drops bots.
//
//  Field mapping MIRRORS apps/web/src/lib/leadPageSchema.js BUILTIN_COLUMN.
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

/* The PUBLISHED version a visitor sees: the snapshot if present, else the live
   fields (covers pages published before the snapshot column + backfill). */
function served(page: any) {
  const s = page.published_snapshot
  if (s && typeof s === 'object') {
    return { theme: s.theme ?? {}, sections: Array.isArray(s.sections) ? s.sections : [], config: s.config ?? {} }
  }
  return { theme: page.theme ?? {}, sections: Array.isArray(page.sections) ? page.sections : [], config: page.config ?? {} }
}

/* Strip a page row down to what the public page may see (from the served version). */
function publicConfig(page: any) {
  const v = served(page)
  return {
    id: page.id,
    kind: page.kind,
    theme: v.theme,
    sections: v.sections,
    // never leak internal config — expose only what the public page needs.
    config: { thankYou: v.config?.thankYou ?? null, seo: v.config?.seo ?? null },
  }
}

/* Pick the form section to submit into: the one whose id matches, else the
   first form section on the page. */
function findFormSection(sections: any[], sectionId: string) {
  const forms = (Array.isArray(sections) ? sections : []).filter((s: any) => s?.type === 'form')
  if (sectionId) return forms.find((s: any) => s.id === sectionId) ?? null
  return forms[0] ?? null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadPublishedPage(idOrSlug: string, kind?: string) {
  if (!idOrSlug) return null
  let q = admin.from('site_pages').select('*').eq('published', true).is('deleted_at', null)
  q = UUID_RE.test(idOrSlug) ? q.eq('id', idOrSlug) : q.eq('slug', idOrSlug.toLowerCase())
  // A slug is unique only PER KIND — pass the route's kind so /lead/<x> and
  // /p/<x> with the same slug never resolve to each other's page.
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q.maybeSingle()
  if (error) { console.error('site-intake load error:', error); return null }
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
      // `kind` is REQUIRED + server-authoritative: a slug is unique only per
      // kind, so without it a crafted request could resolve to the wrong page.
      const kind = str(url.searchParams.get('kind'))
      if (!kind) return json({ error: 'bad_request' }, 400)
      const page = await loadPublishedPage(str(url.searchParams.get('page')), kind)
      if (!page) return json({ error: 'not_found' }, 404)
      return json(publicConfig(page))
    }

    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    // ── POST: accept a form submission ────────────────────────────────
    if (overLimit(`post:${ip}`, 20, 60_000)) return json({ error: 'rate_limited' }, 429)

    const body = await req.json().catch(() => ({}))
    const kind = str(body?.kind)
    if (!kind) return json({ error: 'bad_request' }, 400)
    const page = await loadPublishedPage(str(body?.page), kind)
    if (!page) return json({ error: 'not_found' }, 404)

    const answers = (body?.answers && typeof body.answers === 'object') ? body.answers : {}
    const v = served(page)
    const section = findFormSection(v.sections, str(body?.section))
    if (!section) return json({ error: 'no_form' }, 400)

    const sectionThankYou = section.props?.thankYou ?? v.config?.thankYou ?? null

    // Honeypot: a hidden field bots fill in. Silently pretend success.
    if (str(answers._hp)) return json({ ok: true, thankYou: sectionThankYou })

    const fields = Array.isArray(section.props?.fields) ? section.props.fields : []

    // Required-field validation (server-authoritative).
    for (const f of fields) {
      if (f?.required && !str(answers[f.key])) {
        return json({ error: 'missing_required', field: f.key }, 400)
      }
    }

    // Map answers → columns (builtin) + data (free). Only declared fields.
    const row: Record<string, unknown> = {
      user_id: page.user_id,
      project_id: page.project_id ?? null,
      status: 'new',
      status_meta: 'in_process',
      pending_review: !(section.props?.autoApprove ?? v.config?.autoApprove ?? false),
      data: {},
    }
    const data: Record<string, string> = {}
    let count = 0
    for (const f of fields) {
      if (count >= MAX_FIELDS) break
      if (!f?.key) continue
      const submitted = str(answers[f.key])
      if (!submitted) continue
      // Consent fields: a non-empty submission is just the TICK signal, but the
      // stored value is SERVER-DERIVED from the page's own consent sentence
      // (f.label). So a forged POST can't write arbitrary "proof of consent"
      // text, and a multi-thousand-char client payload can't be smuggled in.
      const val = (f.type === 'consent' ? str(f.label || f.key) : submitted).slice(0, MAX_ANSWER_LEN)
      count += 1
      const col = BUILTIN_COLUMN[f.key]
      if (col) row[col] = val
      else data[f.key] = val
    }
    row.data = data

    // leads.name is NOT NULL — guarantee a value.
    if (!str(row.name)) {
      row.name = str(row.phone) || str(row.email) || 'פנייה מהדף'
    }
    row.inquiry_date = new Date().toISOString().slice(0, 10)

    const { error } = await admin.from('leads').insert(row)
    if (error) {
      console.error('site-intake insert error:', error)
      return json({ error: 'insert_failed' }, 500)
    }

    return json({ ok: true, thankYou: sectionThankYou })
  } catch (e) {
    console.error('site-intake error:', e)
    return json({ error: 'internal_error' }, 500)
  }
})
