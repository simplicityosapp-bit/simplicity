// ════════════════════════════════════════════════════════════════
//  landing-events — PUBLIC, anonymous funnel beacons for the marketing
//  landing page (/).
// ════════════════════════════════════════════════════════════════
//  The landing page and the signup screen POST tiny, anonymous events here:
//    • { type: 'view' }             — the landing page was loaded
//    • { type: 'signup_start' }     — a visitor clicked the signup CTA
//    • { type: 'signup_complete' }  — an account was actually created
//  Optional { sid } is a random landing-session id (minted per tab, and
//  mirrored to localStorage so it survives the hop to the signup screen and
//  the OAuth round trip) linking view -> signup_start -> signup_complete
//  ('direct' when the person never passed through the landing page). NO PII,
//  no cookies, no user id — nothing here says WHICH account was created.
//
//  signup_complete is the one event an AUTHENTICATED browser can send (the
//  Google return already holds a session), so supabase-js attaches that
//  user's JWT instead of the anon key. That is fine: the function is deployed
//  --no-verify-jwt and never reads the caller's identity, so a user JWT is
//  ignored exactly like the anon key. RLS is not in the path at all — the
//  table has RLS on with NO policy, and only this function's service-role
//  client (which bypasses RLS) ever writes it.
//
//  PUBLIC — deploy with:
//      supabase functions deploy landing-events --no-verify-jwt
//  (anyone on the internet can POST; the function holds the service role
//  to write the otherwise-locked landing_events table.)
//
//  Trust model: type is whitelisted, sid is length-capped, per-IP rate
//  limit blunts floods. The data is aggregate-only and non-identifying, so
//  there is nothing here worth forging.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const TYPES = new Set([
  'view', 'signup_start',
  // the funnel's last stage: an account was actually created (migration 0114).
  // Unlike the others this one can arrive from an authenticated browser --
  // see the note in the header block.
  'signup_complete',
  // engagement signals (migration 0051)
  'scroll_50', 'scroll_75', 'scroll_100', 'faq_open', 'engaged',
])

/* Per-IP rate limit (best-effort, per warm isolate; resets on cold start). */
const RL = new Map<string, number[]>()
function overLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (RL.get(key) ?? []).filter((t) => now - t < windowMs)
  arr.push(now)
  RL.set(key, arr)
  if (RL.size > 10_000) RL.clear()
  return arr.length > max
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (overLimit(`le:${ip}`, 60, 60_000)) return json({ error: 'rate_limited' }, 429)

  try {
    const body = await req.json().catch(() => ({}))
    const type = String(body?.type ?? '')
    if (!TYPES.has(type)) return json({ error: 'bad_type' }, 400)
    const sid = body?.sid ? String(body.sid).slice(0, 64) : null

    const { error } = await admin.from('landing_events').insert({ type, session_id: sid })
    if (error) {
      console.error('landing-events insert error:', error)
      return json({ error: 'insert_failed' }, 500)
    }
    return json({ ok: true })
  } catch (e) {
    console.error('landing-events error:', e)
    return json({ error: 'internal_error' }, 500)
  }
})
