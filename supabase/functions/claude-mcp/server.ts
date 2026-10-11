// ════════════════════════════════════════════════════════════════
//  claude-mcp / server.ts — request handling (auth, JSON-RPC, dispatch).
// ════════════════════════════════════════════════════════════════
//  Pure: no Deno/JSR imports and no direct DB access (that is db.ts), so the
//  tests can drive it end-to-end with a fake client.
//
//  SECURITY MODEL (load-bearing):
//    1. AUTHN on every request, including initialize: `Authorization: Bearer
//       smp_…`. The token is hashed (SHA-256) and looked up in ONE query that
//       returns expiry, revocation and categories. Not cached — revoking or
//       changing categories in the app takes effect on the very next request.
//       Unknown, revoked, expired and malformed tokens all get the SAME 401.
//    2. TENANT ISOLATION: the user id comes only from the token row. Tools get
//       a `read` already bound to it (db.readRows adds user_id + no-Trash +
//       column allowlist + 200-row cap). No user id is ever taken from input.
//    3. CATEGORIES, enforced twice and independently: tools/list shows only
//       allowed tools; tools/call re-checks the token's categories itself, so
//       calling a tool by name without listing it is still refused.
//    4. READ ONLY: no write/edit/delete tool exists.
//    5. TRANSPORT: Streamable HTTP, stateless; one JSON response per request,
//       202 for notifications. GET/DELETE → 405.
//    6. BROWSERS: any request with an Origin header is refused (no web caller
//       exists for this endpoint; the token is the real control).
//    7. RATE LIMITS: per IP and per token digest (best-effort, per isolate).
//    8. NO LEAKAGE: short fixed errors; never a DB message, the token or its
//       hash — not in responses and not in logs.
// ════════════════════════════════════════════════════════════════
import { MCP_CATEGORIES, type McpCategory } from '../_shared/mcp-categories.ts'
import { type Db, type TokenRow } from './db.ts'
import { ArgError, toolAllowed, TOOLS } from './tools.ts'

export const SERVER_NAME = 'simplicity'
export const SERVER_VERSION = '1.0.0'

const SUPPORTED_PROTOCOL = ['2025-06-18', '2025-03-26', '2024-11-05']
const DEFAULT_PROTOCOL = '2025-06-18'
const LAST_USED_REFRESH_MS = 5 * 60_000
const TOKEN_SHAPE = /^smp_[A-Za-z0-9_-]{43,}$/

export type Deps = { db: Db; now?: () => number }
type Auth = { tokenId: string; userId: string; categories: McpCategory[]; expiresAt: string }

// ── Helpers ──────────────────────────────────────────────────────────
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

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

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra },
  })
const unauthorized = () => json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' })
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status)
const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: '2.0', id, result })
const toolText = (id: unknown, text: string, isError = false) =>
  rpcResult(id, { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) })

// ── Auth ─────────────────────────────────────────────────────────────
async function authenticate(presented: string, deps: Deps): Promise<Auth | null> {
  if (!TOKEN_SHAPE.test(presented)) return null
  const row: TokenRow | null = await deps.db.findToken(await sha256Hex(presented))
  if (!row) return null
  const now = (deps.now ?? Date.now)()
  if (row.revoked_at) return null
  if (!(Date.parse(row.expires_at) > now)) return null

  // Unknown keys in the row are ignored rather than trusted.
  const categories = MCP_CATEGORIES.filter((c) => (row.categories ?? []).includes(c))

  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0
  if (!last || now - last > LAST_USED_REFRESH_MS) await deps.db.touchLastUsed(row.id, row.user_id)

  return { tokenId: row.id, userId: row.user_id, categories, expiresAt: row.expires_at }
}

// ── Dispatch ─────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function dispatch(auth: Auth, msg: any, deps: Deps): Promise<Response> {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize': {
      const client = params?.protocolVersion
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOL.includes(client) ? client : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: 'Read-only access to the coach\'s own Simplicity data, limited to the data categories they enabled. If a question needs data you have no tool for, call get_access_info and tell the user which category to enable.',
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.filter((t) => toolAllowed(t, auth.categories))
          .map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      })
    case 'tools/call': {
      const name = params?.name
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) return rpcError(id, -32602, 'Unknown tool')
      // ⚠️ Independent of tools/list: a client can call any name directly.
      if (!toolAllowed(tool, auth.categories)) {
        return toolText(id, 'This tool is not enabled for this connection. Call get_access_info to see which data categories the user enabled.', true)
      }
      const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}
      try {
        const result = await tool.run({
          args,
          read: (spec) => deps.db.readRows(auth.userId, spec),   // ← bound to the token's user
          categories: auth.categories,
          expiresAt: auth.expiresAt,
        })
        return toolText(id, JSON.stringify(result))
      } catch (e) {
        if (e instanceof ArgError) return toolText(id, e.message, true)
        return toolText(id, `Could not complete ${tool.name}.`, true)
      }
    }
    default:
      return rpcError(id, -32601, 'Method not found')
  }
}

// ── Entry ────────────────────────────────────────────────────────────
export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (req.headers.get('origin')) return json({ error: 'forbidden_origin' }, 403)

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    if (overLimit(`ip:${ip}`, 240, 60_000)) return json({ error: 'rate_limited' }, 429)

    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

    const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)\s*$/i)
    const presented = m?.[1] ?? ''
    if (!presented) return unauthorized()
    // Limit on the digest, before the lookup, so guesses can't hammer the DB.
    if (overLimit(`tok:${await sha256Hex(presented)}`, 120, 60_000)) return json({ error: 'rate_limited' }, 429)

    const auth = await authenticate(presented, deps)
    if (!auth) return unauthorized()

    // deno-lint-ignore no-explicit-any
    let msg: any
    try { msg = await req.json() } catch { return rpcError(null, -32700, 'Parse error', 400) }
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return rpcError(msg?.id ?? null, -32600, 'Invalid Request', 400)
    }
    if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202, headers: CORS })

    return await dispatch(auth, msg, deps)
  } catch {
    // Fixed line only: never the request, the token, its hash or a DB message.
    console.error('claude-mcp: internal error')
    return rpcError(null, -32603, 'Internal error')
  }
}
