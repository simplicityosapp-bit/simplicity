// ════════════════════════════════════════════════════════════════
//  landing-events — PUBLIC, anonymous funnel beacons for the marketing
//  landing page (/).
// ════════════════════════════════════════════════════════════════
//  The logged-out landing page POSTs tiny, anonymous events here:
//    • { type: 'view' }          — the landing page was loaded
//    • { type: 'signup_start' }  — a visitor clicked the signup CTA
//  Optional { sid } is a per-tab random id (sessionStorage) that links a
//  view to its signup_start within one session. NO PII, no cookies, no
//  user id. The "signup completed" stage is computed elsewhere from
//  auth.users — never stored here.
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

const TYPES = new Set(['view', 'signup_start'])

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
