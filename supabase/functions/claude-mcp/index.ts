// ════════════════════════════════════════════════════════════════
//  claude-mcp — remote MCP server (Streamable HTTP) for the Claude
//  connector. Lets a user's OWN Claude (Desktop / Claude Code / Cowork)
//  read — and later edit — their Simplicity data through MCP tools.
// ════════════════════════════════════════════════════════════════
//  ⚠️ FEASIBILITY SPIKE — read-only, single tool (`list_clients`).
//  The point of this stage is to prove a Supabase Edge Function can host
//  a remote MCP server that Claude connects to. No mutations yet, so
//  there is zero write/delete blast radius while we validate transport.
//
//  DEPLOY (custom token auth — NOT a Supabase JWT):
//      supabase functions deploy claude-mcp --no-verify-jwt
//
//  SPIKE AUTH (replaced by the hashed `mcp_tokens` table in stage 2):
//    - MCP_SPIKE_TOKEN     — the bearer token the client sends
//    - MCP_SPIKE_USER_ID   — the single user that token maps to
//  Set them as Edge Function secrets; never hardcode a token in source.
//
//  ── SECURITY MODEL (this is the whole point — treat as load-bearing) ──
//    1. AUTHN: a high-entropy bearer token in the `Authorization` header
//       (NOT a query param — query strings leak into logs/proxies). The
//       token is compared by its SHA-256 digest, and maps to exactly one
//       user_id. No token → 401. Everything is private; even `initialize`
//       requires auth.
//    2. TENANT ISOLATION: every DB read is filtered by the resolved
//       user_id. We NEVER accept a user id from the client. This is the
//       #1 cross-tenant leak vector — guard it on every single query.
//    3. TRANSPORT: Streamable HTTP. Requests → one `application/json`
//       JSON-RPC response; notifications → 202. Stateless (no session id).
//    4. DNS-REBINDING: the spec asks servers to validate `Origin`. Our
//       real control is the secret bearer token, which a malicious web
//       page cannot read out of the user's Claude config — so rebinding
//       cannot authenticate. We still reject blatantly-cross-site Origins
//       defensively (see allowOrigin).
//    5. RATE LIMITING: per-IP + per-token, best-effort in-isolate (same
//       honest tradeoff as invoice-webhook).
//    6. NO LEAKAGE: errors return generic JSON-RPC error envelopes; we
//       never echo internal details or stack traces to the client.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

const SPIKE_TOKEN = Deno.env.get('MCP_SPIKE_TOKEN') ?? ''
// The spike token maps to ONE user. Prefer an explicit id; otherwise resolve
// from an email server-side via the service role (so no UUID handling needed).
const SPIKE_USER_ID = Deno.env.get('MCP_SPIKE_USER_ID') ?? ''
const SPIKE_USER_EMAIL = (Deno.env.get('MCP_SPIKE_USER_EMAIL') ?? '').trim().toLowerCase()

let cachedSpikeUserId: string | null = null
async function resolveSpikeUserId(): Promise<string | null> {
  if (SPIKE_USER_ID) return SPIKE_USER_ID
  if (cachedSpikeUserId) return cachedSpikeUserId
  if (!SPIKE_USER_EMAIL) return null
  // Scan auth users for the configured email (spike-only; the real stage maps
  // a hashed token row → user_id directly, no scan).
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const users = data?.users ?? []
    const found = users.find((u) => (u.email ?? '').toLowerCase() === SPIKE_USER_EMAIL)
    if (found) { cachedSpikeUserId = found.id; return found.id }
    if (users.length < 1000) break
  }
  return null
}

const SERVER_NAME = 'simplicity'
const SERVER_VERSION = '0.1.0-spike'
// Protocol versions we understand. We negotiate down to the client's if known.
const SUPPORTED_PROTOCOL = ['2025-06-18', '2025-03-26', '2024-11-05']
const DEFAULT_PROTOCOL = '2025-06-18'

// ── SHA-256 hex (Web Crypto, available in the Deno edge runtime) ──────
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
// Compare two equal-length hex digests in constant time (defence-in-depth;
// reversing a SHA-256 digest is already infeasible, but don't leak timing).
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── Rate limiting (best-effort, per warm isolate) ────────────────────
const RL = new Map<string, number[]>()
function overLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const arr = (RL.get(key) ?? []).filter((t) => now - t < windowMs)
  arr.push(now)
  RL.set(key, arr)
  if (RL.size > 10_000) RL.clear()
  return arr.length > max
}

// ── CORS / preflight ─────────────────────────────────────────────────
// Auth is by secret bearer token, so a permissive ACAO can't be abused
// (a cross-site page can't read the token out of the user's config). We
// still scope allowed headers/methods tightly.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}

// Defensive Origin gate: requests from MCP CLIs / Claude carry no browser
// Origin. If a real browser Origin shows up, refuse — there is no first-
// party web caller for this endpoint. (Token is still the real control.)
function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // non-browser client (mcp-remote, Claude Code) — fine
  return false // any browser Origin is unexpected here → reject
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  })

// JSON-RPC error envelope (id may be null for unparseable input).
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status)
const rpcResult = (id: unknown, result: unknown) =>
  json({ jsonrpc: '2.0', id, result })

// ── Tool catalogue (spike: one read-only tool) ───────────────────────
const TOOLS = [
  {
    name: 'list_clients',
    description:
      "List the signed-in coach's clients (their own data only). Returns name, status, contact details and pricing. Read-only.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max rows to return (1-200). Default 50.' },
        search: { type: 'string', description: 'Optional case-insensitive name filter.' },
      },
      additionalProperties: false,
    },
  },
]

// ── Tool: list_clients — STRICTLY scoped to the resolved userId ──────
async function listClients(userId: string, args: Record<string, unknown>) {
  const rawLimit = Number(args?.limit)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50
  let q = admin.from('clients')
    .select('id, name, status_meta, email, phone, sessions, price_per_session, billing_mode, created_at')
    .eq('user_id', userId)          // ← tenant isolation: never widen this
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  const search = typeof args?.search === 'string' ? args.search.trim() : ''
  if (search) q = q.ilike('name', `%${search}%`)
  const { data, error } = await q
  if (error) throw new Error('query_failed')
  return data ?? []
}

// ── JSON-RPC dispatch for a single request message ───────────────────
async function dispatch(userId: string, msg: any) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize': {
      const client = params?.protocolVersion
      const protocolVersion = SUPPORTED_PROTOCOL.includes(client) ? client : DEFAULT_PROTOCOL
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })
    case 'tools/call': {
      const name = params?.name
      const args = (params?.arguments ?? {}) as Record<string, unknown>
      if (name !== 'list_clients') return rpcError(id, -32602, 'Unknown tool')
      try {
        const rows = await listClients(userId, args)
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
        })
      } catch {
        // isError result (not a transport error) so the model sees a clean message.
        return rpcResult(id, {
          content: [{ type: 'text', text: 'Could not read clients.' }],
          isError: true,
        })
      }
    }
    default:
      return rpcError(id, -32601, 'Method not found')
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (!originAllowed(req)) return json({ error: 'forbidden_origin' }, 403)

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    if (overLimit(`ip:${ip}`, 240, 60_000)) return json({ error: 'rate_limited' }, 429)

    // GET/DELETE: no server-initiated SSE and no sessions → 405 (spec-allowed).
    if (req.method === 'GET' || req.method === 'DELETE') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS })
    }
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

    // ── AUTHN — required on every request, including initialize ──────
    const authz = req.headers.get('authorization') ?? ''
    const m = authz.match(/^Bearer\s+(.+)$/i)
    const presented = m?.[1]?.trim() ?? ''
    if (!presented || !SPIKE_TOKEN) {
      return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
    }
    const presentedHash = await sha256Hex(presented)
    if (overLimit(`tok:${presentedHash}`, 120, 60_000)) {
      return json({ error: 'rate_limited' }, 429)
    }
    const ok = timingSafeEqualHex(presentedHash, await sha256Hex(SPIKE_TOKEN))
    if (!ok) return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
    const userId = await resolveSpikeUserId()
    if (!userId) return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })

    // ── Parse the JSON-RPC message ──────────────────────────────────
    let msg: any
    try { msg = await req.json() } catch { return rpcError(null, -32700, 'Parse error', 400) }
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return rpcError(msg?.id ?? null, -32600, 'Invalid Request', 400)
    }

    // Notifications / responses (no id) → 202 Accepted, no body.
    if (msg.id === undefined || msg.id === null) {
      return new Response(null, { status: 202, headers: CORS })
    }

    return await dispatch(userId, msg)
  } catch (e) {
    console.error('claude-mcp error:', e)
    return rpcError(null, -32603, 'Internal error')
  }
})
