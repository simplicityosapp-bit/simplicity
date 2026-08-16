// ════════════════════════════════════════════════════════════════
//  claude-mcp — remote MCP server (Streamable HTTP) for the Claude
//  connector. Lets a user's OWN Claude (Desktop / Claude Code / Cowork)
//  read — and later edit — their Simplicity data through MCP tools.
// ════════════════════════════════════════════════════════════════
//  STAGE 2a — scoped tokens. Auth is a row in `mcp_tokens` (migration 0109),
//  not an environment secret, so tokens are per-user, revocable, and carry a
//  SCOPE that decides what the connector may do:
//
//    scope 'read'        → the read tools only.
//    scope 'read_write'  → read tools + create/edit tools.
//
//  NO DELETE AT ANY SCOPE (owner decision 16/08). There is no delete tool in
//  this file, of any kind, soft or hard. A model that misreads an instruction
//  can remove a client or a month of transactions in a single call, and
//  "restorable from Trash for 30 days" is a recovery story, not a permission
//  model. Removing things stays a decision the user makes in the app. The scope
//  check is the second line of defence here; the first is that the capability
//  was never built.
//
//  DEPLOY (custom token auth — NOT a Supabase JWT):
//      supabase functions deploy claude-mcp --no-verify-jwt
//
//  Issuing a token: see the recipe at the foot of migration 0109. The token is
//  generated outside the database and only its SHA-256 is stored.
//
//  ════════════════════════════════════════════════════════════════
//  ⛔ NOT LIVE. PAUSED 16/08/2026 — HOW THE TOKEN SHOULD WORK IS STILL OPEN.
//  ════════════════════════════════════════════════════════════════
//  This file and migration 0109 are merged but INERT. Before touching either,
//  read this — the paused state is deliberate, not an oversight.
//
//  CURRENT STATE (verify before trusting; this note is from 16/08):
//    - Migration 0109 has NOT been run. No `mcp_tokens` table exists, so even
//      if this code were deployed the lookup would fail and every request
//      would 401. That is the intended failure direction.
//    - The DEPLOYED function is still the older spike (v7, env-secret auth,
//      secrets unset → inert). The repo and the deployment have DIVERGED.
//      ⚠️ Do not "deploy all functions" casually: that would push this code
//      live against a table that does not exist.
//    - The connections screen shows Claude as a disabled "בקרוב" row
//      (screens/connections/index.jsx, SOON). Users cannot reach any of this.
//      Leave it that way until the decisions below are made.
//
//  WHAT IS DECIDED:
//    - Two scopes, 'read' and 'read_write'. No delete at any scope, ever.
//    - The token is hashed, per-user, revocable (migration 0109).
//
//  WHAT IS NOT DECIDED — the reason this is paused:
//    1. WHETHER A PASTED TOKEN IS THE RIGHT MECHANISM AT ALL. It only works in
//       Claude Code. Cowork and claude.ai web use the app's own Connectors,
//       which are OAuth-only with no field to paste a token into — so the
//       coaches this product is for cannot connect this way. An official OAuth
//       connector is what actually opens it to them, and that is separate work
//       that may well replace this token flow rather than build on it. Do not
//       invest further in the token path before settling this.
//    2. HOW A USER GETS A TOKEN. There is no UI. Issuing is a manual SQL
//       insert by the owner (recipe in 0109). The "בקרוב" row is the
//       placeholder for whatever replaces that.
//    3. EDIT TOOLS. 'read_write' was approved for create AND edit; only create
//       exists (create_task). No edit tool has been designed.
//    4. WHAT THE USER IS TOLD. Connecting means a coach's client data — names,
//       phone numbers, pricing — flows into their Claude session on every
//       question they ask. That needs saying plainly at the point of
//       connection, and the wording has not been written.
//  ════════════════════════════════════════════════════════════════
//
//  ── SECURITY MODEL (this is the whole point — treat as load-bearing) ──
//    1. AUTHN: a high-entropy bearer token in the `Authorization` header
//       (NOT a query param — query strings leak into logs/proxies). The
//       token is compared by its SHA-256 digest, and maps to exactly one
//       user_id. No token → 401. Everything is private; even `initialize`
//       requires auth.
//    2. TENANT ISOLATION: every DB read AND write is filtered by the
//       resolved user_id. We NEVER accept a user id from the client. This
//       is the #1 cross-tenant leak vector — guard it on every single
//       query. Any id the client DOES send (a client_id to attach a task
//       to) is re-checked against that user before it is used, or the
//       model could staple its row to another tenant's record.
//    2b. SCOPE: tools declare what they need. `tools/list` hides what the
//       token cannot call, and `tools/call` re-checks independently —
//       filtering the catalogue is a courtesy to the model, not a
//       control, since a client can call any name it likes.
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

const SERVER_NAME = 'simplicity'
const SERVER_VERSION = '0.2.0'

// Scopes, most restrictive first. 'read_write' is a superset of 'read'.
type Scope = 'read' | 'read_write'
type Auth = { tokenId: string; userId: string; scope: Scope }

// How stale last_used_at may get before we spend a write refreshing it. The
// column answers "is this token still in use / should I revoke it", which does
// not need minute precision — and an UPDATE on every single tool call would
// double the round-trips of the hot path for nothing.
const LAST_USED_REFRESH_MS = 5 * 60_000
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

// ── Token → user + scope ─────────────────────────────────────────────
// Deliberately NOT cached. Caching an auth decision in a warm isolate means a
// revoked token keeps working until that isolate happens to die — the user
// pressed "revoke" and we carried on serving their data. One indexed lookup on
// a UNIQUE column is a price worth paying for revocation that takes effect when
// the user asks for it.
async function resolveToken(presented: string): Promise<Auth | null> {
  const hash = await sha256Hex(presented)
  const { data, error } = await admin
    .from('mcp_tokens')
    .select('id, user_id, scope, token_hash, last_used_at')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .maybeSingle()
  if (error || !data) return null
  // Belt and braces: the row came back from an equality filter, so this can
  // only fail if the driver handed us something else entirely — but the
  // comparison is free and the failure mode it guards is total.
  if (!timingSafeEqualHex(hash, String(data.token_hash ?? ''))) return null
  const scope: Scope = data.scope === 'read_write' ? 'read_write' : 'read'

  // Throttled touch — see LAST_USED_REFRESH_MS.
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0
  if (!last || Date.now() - last > LAST_USED_REFRESH_MS) {
    await admin.from('mcp_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(undefined, () => { /* never fail a request over bookkeeping */ })
  }
  return { tokenId: data.id, userId: data.user_id, scope }
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

// ── Tool catalogue ───────────────────────────────────────────────────
// `needs` is stripped before the catalogue goes over the wire — it is our
// bookkeeping, not part of the MCP tool shape.
const TOOLS: Array<{ name: string; needs: Scope; description: string; inputSchema: unknown }> = [
  {
    name: 'list_clients',
    needs: 'read',
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
  {
    name: 'create_task',
    needs: 'read_write',
    description:
      "Create a task on the signed-in coach's own task board. Optionally attach it to one of their clients. Cannot edit or remove anything that already exists.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What needs doing. Required, 1-500 characters.' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: "Defaults to 'medium'." },
        due_at: { type: 'string', description: 'Optional ISO-8601 due date/time.' },
        description: { type: 'string', description: 'Optional longer note, up to 5000 characters.' },
        client_id: { type: 'string', description: "Optional id of one of the coach's own clients, from list_clients." },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
]

const allows = (scope: Scope, needs: Scope): boolean => scope === 'read_write' || needs === 'read'
// What the client is allowed to see. Hiding a tool the token cannot use keeps
// the model from planning around a capability it will only be refused.
const toolsFor = (scope: Scope) =>
  TOOLS.filter((t) => allows(scope, t.needs)).map(({ needs: _needs, ...t }) => t)

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

// ── Tool: create_task — the only write, and it only ADDS ─────────────
// Creates nothing but a task, touches no existing row, and cannot remove
// anything. user_id is the resolved one, never a client-supplied value.
async function createTask(userId: string, args: Record<string, unknown>) {
  const title = typeof args?.title === 'string' ? args.title.trim() : ''
  if (!title) throw new Error('title_required')
  if (title.length > 500) throw new Error('title_too_long')

  const rawPriority = typeof args?.priority === 'string' ? args.priority : 'medium'
  // The column has a CHECK constraint; reject here so the model gets a sentence
  // instead of a Postgres error.
  if (!['high', 'medium', 'low'].includes(rawPriority)) throw new Error('bad_priority')

  const description = typeof args?.description === 'string' ? args.description.trim() : ''
  if (description.length > 5000) throw new Error('description_too_long')

  let dueAt: string | null = null
  if (args?.due_at != null && args.due_at !== '') {
    const parsed = Date.parse(String(args.due_at))
    if (Number.isNaN(parsed)) throw new Error('bad_due_at')
    dueAt = new Date(parsed).toISOString()
  }

  // ⚠️ TENANT ISOLATION on a client-supplied id. Without this check the model
  // could pass any uuid and staple this task to another coach's client — the
  // FK would happily accept it, because the constraint only knows the id is a
  // client, not whose. Re-resolve it against THIS user or refuse.
  let clientId: string | null = null
  if (args?.client_id != null && args.client_id !== '') {
    const candidate = String(args.client_id)
    const { data: owned, error: ownErr } = await admin
      .from('clients')
      .select('id')
      .eq('id', candidate)
      .eq('user_id', userId)        // ← never widen this
      .is('deleted_at', null)
      .maybeSingle()
    if (ownErr) throw new Error('query_failed')
    if (!owned) throw new Error('unknown_client')
    clientId = owned.id
  }

  const { data, error } = await admin
    .from('tasks')
    .insert({
      user_id: userId,             // ← the resolved user, never args
      title,
      priority: rawPriority,
      status: 'todo',
      due_at: dueAt,
      description: description || null,
      client_id: clientId,
    })
    .select('id, title, priority, status, due_at, client_id, created_at')
    .single()
  if (error) throw new Error('insert_failed')
  return data
}

// A refusal the model can read, rather than a bare code.
const TOOL_ERRORS: Record<string, string> = {
  title_required: 'A task needs a title.',
  title_too_long: 'That title is too long (max 500 characters).',
  bad_priority: "Priority must be one of 'high', 'medium' or 'low'.",
  description_too_long: 'That description is too long (max 5000 characters).',
  bad_due_at: 'Could not read that due date. Use an ISO-8601 date/time.',
  unknown_client: 'No such client on this account.',
}

// ── JSON-RPC dispatch for a single request message ───────────────────
async function dispatch(auth: Auth, msg: any) {
  const { id, method, params } = msg
  const { userId, scope } = auth
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
      return rpcResult(id, { tools: toolsFor(scope) })
    case 'tools/call': {
      const name = params?.name
      const args = (params?.arguments ?? {}) as Record<string, unknown>
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) return rpcError(id, -32602, 'Unknown tool')
      // ⚠️ Re-checked here, independently of what tools/list showed. A client
      // can call any name it likes without ever reading the catalogue, so the
      // filtering in tools/list is a courtesy to the model and THIS is the
      // control. A read-only token is told the tool does not exist rather than
      // that it exists and is barred — there is nothing useful in confirming
      // the shape of what it cannot reach.
      if (!allows(scope, tool.needs)) return rpcError(id, -32602, 'Unknown tool')
      try {
        const result = name === 'list_clients'
          ? await listClients(userId, args)
          : await createTask(userId, args)
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      } catch (e) {
        // isError result (not a transport error) so the model sees a clean
        // message. Only our own known reasons are echoed — never a driver or
        // Postgres error, which would leak schema detail.
        const reason = e instanceof Error ? e.message : ''
        return rpcResult(id, {
          content: [{ type: 'text', text: TOOL_ERRORS[reason] ?? `Could not complete ${name}.` }],
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
    if (!presented) {
      return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
    }
    // Rate-limit on the digest, before the lookup: the limiter must not become
    // the thing that lets someone hammer the database with guesses.
    if (overLimit(`tok:${await sha256Hex(presented)}`, 120, 60_000)) {
      return json({ error: 'rate_limited' }, 429)
    }
    const auth = await resolveToken(presented)
    // One answer for "no such token", "revoked" and "malformed" alike — telling
    // them apart tells a prober which of their guesses was once real.
    if (!auth) return json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })

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

    return await dispatch(auth, msg)
  } catch (e) {
    console.error('claude-mcp error:', e)
    return rpcError(null, -32603, 'Internal error')
  }
})
