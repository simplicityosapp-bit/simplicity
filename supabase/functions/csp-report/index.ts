// ════════════════════════════════════════════════════════════════
//  csp-report — PUBLIC, anonymous Content-Security-Policy violations.
// ════════════════════════════════════════════════════════════════
//  apps/web/api/csp-report.js receives what browsers post to
//  /api/csp-report, normalises the two wire formats and drops the browser-
//  extension noise, then forwards the survivors here as
//  { violations: [{ directive, blocked, doc, source, line, sample }, …] }.
//
//  Why the hop rather than writing from the Vercel function: csp_violations
//  has RLS on with NO policy (migration 0117), so only a service-role client
//  can write it — and the service role belongs in an edge function, where
//  Supabase injects it, not in a Vercel env var. Same arrangement as
//  landing-events, for the same reason.
//
//  PUBLIC — deploy with:
//      supabase functions deploy csp-report --no-verify-jwt
//  (the caller is a Vercel function holding only the publishable key.)
//
//  Trust model: a violation report is unauthenticated by nature — the
//  browser posts it with no credentials, so anything arriving here is
//  forgeable and is treated as a hint, not a fact. Hence: a cap on how many
//  violations one request may carry, length caps on every field, a per-IP
//  rate limit, and a table that nobody can read back. The worst a forger
//  achieves is noise in a diagnostic table that exists to be dropped.
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

/* One page load can legitimately violate a policy several times over, but
   not many: a handful is a bug, hundreds is a flood. */
const MAX_PER_REQUEST = 5
const MAX_FIELD = 300

const str = (v: unknown) => (v == null ? null : String(v).slice(0, MAX_FIELD) || null)

/* Per-IP rate limit (best-effort, per warm isolate; resets on cold start) —
   the same shape landing-events uses. */
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
  if (overLimit(`csp:${ip}`, 30, 60_000)) return json({ error: 'rate_limited' }, 429)

  try {
    const body = await req.json().catch(() => ({}))
    const list = Array.isArray(body?.violations) ? body.violations.slice(0, MAX_PER_REQUEST) : []
    if (!list.length) return json({ ok: true, stored: 0 })

    const rows = list.map((v: Record<string, unknown>) => ({
      directive: str(v?.directive),
      blocked_uri: str(v?.blocked),
      document_uri: str(v?.doc),
      source_file: str(v?.source),
      /* Number() on junk gives NaN, which Postgres rejects — keep null. */
      line_number: Number.isFinite(Number(v?.line)) ? Math.trunc(Number(v.line)) : null,
      script_sample: str(v?.sample),
    }))

    const { error } = await admin.from('csp_violations').insert(rows)
    if (error) {
      console.error('csp-report insert error:', error)
      return json({ error: 'insert_failed' }, 500)
    }
    return json({ ok: true, stored: rows.length })
  } catch (e) {
    console.error('csp-report error:', e)
    return json({ error: 'internal_error' }, 500)
  }
})
