// ════════════════════════════════════════════════════════════════
//  mcp-tokens / handler.ts — request handling for the token-management API.
// ════════════════════════════════════════════════════════════════
//  Pure (no Deno/JSR imports, no direct DB access — that is store.ts), so the
//  tests can drive it with a fake store. See index.ts for the action list.
//
//  RULES:
//    - The user id comes ONLY from deps.getUserId (the verified JWT), never
//      from the body.
//    - create requires the current consent version (CONSENT_VERSION); missing
//      or stale → 400 consent_required. The version is stored with the token
//      in the same transaction (mcp_token_issue).
//    - The token exists in memory for one request and appears only in the
//      create response. It and its hash are never logged.
//    - renew never touches the consent record. update-categories needs a fresh
//      consent (current version) for any category outside consented_categories;
//      the rule itself runs in the DB (mcp_token_update_categories).
// ════════════════════════════════════════════════════════════════
import { CONSENT_VERSION, parseCategories, TOKEN_TTL_DAYS } from '../_shared/mcp-categories.ts'
import type { Store, TokenRow } from './store.ts'

export type Deps = {
  getUserId: (req: Request) => Promise<string | null>
  store: Store
  mcpUrl: string
}

const TOKEN_PREFIX = 'smp_'
const TOKEN_BYTES = 32

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
// Short, stable error codes. Never a DB message.
const fail = (error: string, status: number) => json({ error }, status)

// ── Rate limiting (best-effort, per warm isolate) ────────────────────
// The hard limit on creation is in the DB (mcp_token_issue: 5 per hour per
// user); this one just blunts bursts before they reach it.
const RL = new Map<string, number[]>()
function overLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (RL.get(key) ?? []).filter((t) => now - t < windowMs)
  arr.push(now)
  RL.set(key, arr)
  if (RL.size > 10_000) RL.clear()
  return arr.length > max
}
export const resetRateLimits = () => RL.clear()

// ── Token material ───────────────────────────────────────────────────
function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function newToken(): string {
  return TOKEN_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function toStatus(row: TokenRow | null) {
  if (!row) {
    return { active: false, expired: false, categories: [], consented_categories: [], created_at: null, expires_at: null, last_used_at: null }
  }
  return {
    active: true,
    expired: new Date(row.expires_at).getTime() <= Date.now(),
    categories: row.categories,
    // Not secret: lets the UI know when an edit needs a fresh consent. The
    // server enforces it regardless.
    consented_categories: row.consented_categories,
    created_at: row.created_at,
    expires_at: row.expires_at,
    last_used_at: row.last_used_at,
  }
}

const ttlFromNow = () => new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000).toISOString()

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('method_not_allowed', 405)

  let action = 'unknown'
  try {
    const userId = await deps.getUserId(req)
    if (!userId) return fail('unauthorized', 401)
    if (overLimit(`user:${userId}`, 30, 60_000)) return fail('rate_limited', 429)

    const body = await req.json().catch(() => ({}))
    action = typeof body?.action === 'string' ? body.action : 'unknown'
    const { store } = deps

    if (action === 'status') {
      return json({ status: toStatus(await store.activeRow(userId)) })
    }

    if (action === 'create') {
      if (overLimit(`create:${userId}`, 3, 60_000)) return fail('rate_limited', 429)
      const categories = parseCategories(body.categories)
      if (!categories) return fail('invalid_categories', 400)
      // The user must have agreed to the CURRENT consent text.
      if (body.consent_version !== CONSENT_VERSION) return fail('consent_required', 400)

      const token = newToken()
      const result = await store.issue({
        userId, tokenHash: await sha256Hex(token), categories, consentVersion: CONSENT_VERSION,
      })
      if (result === 'rate_limited') return fail('rate_limited', 429)
      return json({ token, url: deps.mcpUrl, status: toStatus(await store.activeRow(userId)) })
    }

    if (action === 'update-categories') {
      // Same rule as renew: allowed on the active (not revoked) row even if it
      // has expired — it is still the user's token, and they may change its
      // categories before or after renewing it. A revoked row never matches.
      // Consent: any category outside consented_categories needs the CURRENT
      // consent version in this request (sensitive or not); otherwise 409 with
      // the missing keys. Removing / re-choosing consented ones needs none.
      const categories = parseCategories(body.categories)
      if (!categories) return fail('invalid_categories', 400)
      const consentVersion = body.consent_version === CONSENT_VERSION ? CONSENT_VERSION : null
      const r = await store.updateCategories(userId, categories, consentVersion)
      if (r.result === 'no_active_token') return fail('no_active_token', 404)
      if (r.result === 'consent_required') return json({ error: 'consent_required', missing: r.missing }, 409)
      return json({ status: toStatus(r.row) })
    }

    if (action === 'renew') {
      // Only the active (not revoked) row can match, so a revoked token can
      // never be renewed. An expired-but-active token can. Consent unchanged.
      const row = await store.renew(userId, ttlFromNow())
      if (!row) return fail('no_active_token', 404)
      return json({ status: toStatus(row) })
    }

    if (action === 'revoke') {
      // Idempotent: revoking when nothing is active is still "off".
      await store.revoke(userId)
      return json({ status: toStatus(null) })
    }

    return fail('bad_request', 400)
  } catch (err) {
    // Action + code only. Never the body, the token or the hash.
    console.error(`mcp-tokens ${action} failed: ${(err as { code?: string })?.code ?? 'unknown'}`)
    return fail('server_error', 500)
  }
}
