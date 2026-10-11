// claude-mcp end to end: server.ts → tools.ts → db.ts → fake client.
// No network, no real database, no real user data.
import { MCP_CATEGORIES, SENSITIVE_CATEGORIES } from '../_shared/mcp-categories.ts'
import { createDb, FORBIDDEN_COLUMNS } from '../claude-mcp/db.ts'
import { handleRequest, resetRateLimits } from '../claude-mcp/server.ts'
import { TOOLS, type ToolContext } from '../claude-mcp/tools.ts'
import { fakeClient } from './fakeSupabase.ts'

type Row = Record<string, unknown>

const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const USER_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const token = (c: string) => `smp_${c.repeat(43)}`
const TOKENS = { a: token('A'), b: token('B'), revoked: token('R'), expired: token('E'), never: token('N') }

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 86_400_000).toISOString()

// Every row carries secret-looking fields, so a leak would show up in output.
const SECRETS = {
  grow_process_token: 'SECRET', grow_process_id: 'SECRET', grow_transaction_id: 'SECRET', payment_url: 'SECRET',
  invoice_document_url: 'SECRET', invoice_credit_document_url: 'SECRET', import_batch_id: 'SECRET',
  google_event_id: 'SECRET', deleted_at: null,
}
const row = (n: number, user: string, extra: Row = {}): Row => ({ id: id(n), user_id: user, ...SECRETS, ...extra })

async function makeTables(): Promise<Record<string, Row[]>> {
  const tokenRow = async (n: number, t: string, user: string, extra: Row) => ({
    id: id(9000 + n), user_id: user, token_hash: await sha256Hex(t), categories: [...MCP_CATEGORIES],
    expires_at: FUTURE, revoked_at: null, last_used_at: null, ...extra,
  })
  return {
    mcp_tokens: [
      await tokenRow(1, TOKENS.a, USER_A, { categories: ['clients'] }),
      await tokenRow(2, TOKENS.b, USER_B, {}),
      await tokenRow(3, TOKENS.revoked, USER_A, { revoked_at: PAST }),
      await tokenRow(4, TOKENS.expired, USER_A, { expires_at: PAST }),
    ],
    clients: [
      row(1, USER_A, { name: 'Alice of A', phone: '050-A', email: 'a@x', notes: 'note A', status_meta: 'active' }),
      row(2, USER_A, { name: 'Trashed of A', deleted_at: PAST }),
      row(3, USER_B, { name: 'Bob of B', phone: '050-B', notes: 'note B' }),
    ],
    sessions: [
      row(10, USER_A, { client_id: id(1), date: '2026-09-01', notes: 'session note A', summary: 's' }),
      row(11, USER_B, { client_id: id(3), date: '2026-09-02', notes: 'session note B' }),
    ],
    transactions: [
      row(20, USER_A, { amount: 100, type: 'income', status: 'confirmed', date: '2026-09-01', client_id: id(1), recipient_tax_id: '123', recipient_phone: '050' }),
      row(21, USER_B, { amount: 999, type: 'income', status: 'confirmed', date: '2026-09-01', client_id: id(3), recipient_tax_id: '999' }),
    ],
    payment_requests: [row(30, USER_A, { amount: 50, status: 'pending', client_id: id(1) })],
    calendar_events: [row(40, USER_B, { title: 'Therapy with Bob', start_time: '2099-01-01T10:00:00Z', end_time: '2099-01-01T11:00:00Z', client_id: id(3) })],
    leads: [row(50, USER_B, { name: 'Lead B', phone: '052', notes: 'lead note', data: { q: 'a' }, inquiry_date: '2026-09-01' })],
    bookings: [row(60, USER_B, { name: 'Booker', phone: '053', starts_at: '2099-01-02T10:00:00Z', status: 'confirmed' })],
    daily_answers: [row(70, USER_B, { date: '2026-09-01', value_text: 'personal' })],
    moon_snapshots: [row(71, USER_B, { date: '2026-09-01', reflection: 'reflection', score: 7 })],
  }
}

let tables: Record<string, Row[]>
let fake: ReturnType<typeof fakeClient>
beforeEach(async () => {
  resetRateLimits()
  tables = await makeTables()
  fake = fakeClient(tables)
})

let nextId = 1
async function rpc(tok: string | null, method: string, params?: unknown, headers: Record<string, string> = {}) {
  const res = await handleRequest(new Request('https://x/functions/v1/claude-mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  }), { db: createDb(fake) })
  return { status: res.status, body: await res.json() }
}
const callTool = async (tok: string, name: string, args: Row = {}) => {
  const r = await rpc(tok, 'tools/call', { name, arguments: args })
  const text = r.body.result?.content?.[0]?.text ?? ''
  return { isError: !!r.body.result?.isError, text, data: r.body.result?.isError ? null : JSON.parse(text || 'null') }
}
const toolNames = async (tok: string) => (await rpc(tok, 'tools/list')).body.result.tools.map((t: { name: string }) => t.name)

// ── Auth ─────────────────────────────────────────────────────────────
describe('auth', () => {
  it('missing, unknown, revoked, expired and malformed tokens get the same 401', async () => {
    const answers = await Promise.all([
      rpc(null, 'tools/list'),
      rpc(TOKENS.never, 'tools/list'),
      rpc(TOKENS.revoked, 'tools/list'),
      rpc(TOKENS.expired, 'tools/list'),
      rpc('not-a-token', 'tools/list'),
    ])
    for (const a of answers) {
      expect(a.status).toBe(401)
      expect(a.body).toEqual({ error: 'unauthorized' })
    }
  })

  it('revocation takes effect on the next request (no cache)', async () => {
    expect((await rpc(TOKENS.a, 'tools/list')).status).toBe(200)
    tables.mcp_tokens[0].revoked_at = new Date().toISOString()
    expect((await rpc(TOKENS.a, 'tools/list')).status).toBe(401)
  })

  it('expiry is checked on every request', async () => {
    expect((await rpc(TOKENS.a, 'tools/list')).status).toBe(200)
    tables.mcp_tokens[0].expires_at = PAST
    expect((await rpc(TOKENS.a, 'tools/list')).status).toBe(401)
  })

  it('a replaced token stops working', async () => {
    // What mcp_token_issue does: revoke the old row, insert a new one.
    tables.mcp_tokens[0].revoked_at = new Date().toISOString()
    const fresh = token('F')
    tables.mcp_tokens.push({ id: id(9100), user_id: USER_A, token_hash: await sha256Hex(fresh), categories: ['clients'], expires_at: FUTURE, revoked_at: null, last_used_at: null })
    expect((await rpc(TOKENS.a, 'tools/list')).status).toBe(401)
    expect((await rpc(fresh, 'tools/list')).status).toBe(200)
  })

  it('refuses browser requests', async () => {
    expect((await rpc(TOKENS.a, 'tools/list', undefined, { origin: 'https://evil.example' })).status).toBe(403)
  })

  it('stamps last_used_at', async () => {
    await rpc(TOKENS.a, 'tools/list')
    expect(tables.mcp_tokens[0].last_used_at).toBeTruthy()
  })

  it('a failing last_used_at write does not fail the request', async () => {
    const throwing = {
      from: (t: string) => {
        const q = fake.from(t)
        if (t === 'mcp_tokens') (q as unknown as { update: () => never }).update = () => { throw new Error('boom') }
        return q
      },
    }
    const res = await handleRequest(new Request('https://x', {
      method: 'POST', headers: { authorization: `Bearer ${TOKENS.a}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    }), { db: createDb(throwing) })
    expect(res.status).toBe(200)
  })

  it('never puts the token or its hash in a response', async () => {
    const hash = await sha256Hex(TOKENS.b)
    for (const t of TOOLS) {
      const r = await rpc(TOKENS.b, 'tools/call', { name: t.name, arguments: {} })
      const s = JSON.stringify(r.body)
      expect(s).not.toContain(TOKENS.b)
      expect(s).not.toContain(hash)
    }
  })
})

// ── Categories ───────────────────────────────────────────────────────
describe('category enforcement', () => {
  it('tools/list shows only the allowed categories + get_access_info', async () => {
    expect((await toolNames(TOKENS.a)).sort()).toEqual(['get_access_info', 'get_client', 'list_clients', 'list_groups'])
  })

  it('tools/call refuses a tool outside the categories even without listing first', async () => {
    for (const t of TOOLS.filter((t) => t.category && t.category !== 'clients')) {
      fake.log.length = 0
      const r = await callTool(TOKENS.a, t.name, { client_ids: [id(1)], transaction_ids: [id(20)], kind: 'recurring', from: '2026-01-01' })
      expect(r.isError, t.name).toBe(true)
      expect(r.text).toMatch(/not enabled/)
      expect(fake.log.filter((q) => q.table !== 'mcp_tokens'), `${t.name} read data`).toEqual([])
    }
  })

  it('category changes take effect on the next request without a new token', async () => {
    expect(await toolNames(TOKENS.a)).not.toContain('get_session_notes')
    tables.mcp_tokens[0].categories = ['clients', 'session_notes']
    expect(await toolNames(TOKENS.a)).toContain('get_session_notes')
    const r = await callTool(TOKENS.a, 'get_session_notes', {})
    expect(r.isError).toBe(false)
  })

  it('get_access_info lists enabled and not-enabled categories and the expiry', async () => {
    const r = await callTool(TOKENS.a, 'get_access_info')
    expect(r.data.enabled.map((c: Row) => c.key)).toEqual(['clients'])
    expect(r.data.not_enabled).toHaveLength(MCP_CATEGORIES.length - 1)
    expect(r.data.expires_at).toBe(FUTURE)
  })
})

// ── Isolation ────────────────────────────────────────────────────────
describe('tenant isolation', () => {
  it('two users never see each other', async () => {
    const a = await callTool(TOKENS.a, 'list_clients')
    expect(a.data.clients.map((c: Row) => c.name)).toEqual(['Alice of A'])
    const b = await callTool(TOKENS.b, 'list_clients')
    expect(b.data.clients.map((c: Row) => c.name)).toEqual(['Bob of B'])
  })

  it("another user's ids return nothing", async () => {
    expect((await callTool(TOKENS.a, 'get_client', { client_id: id(3) })).data.client).toBeNull()
    tables.mcp_tokens[0].categories = [...MCP_CATEGORIES]
    const contacts = await callTool(TOKENS.a, 'get_contact_details', { client_ids: [id(3)], transaction_ids: [id(21)] })
    expect(contacts.data.clients).toEqual([])
    expect(contacts.data.transaction_recipients).toEqual([])
    expect((await callTool(TOKENS.a, 'get_tax_ids', { transaction_ids: [id(21)] })).data.tax_ids).toEqual([])
  })

  it('a user_id passed in arguments is ignored', async () => {
    const r = await callTool(TOKENS.a, 'list_clients', { user_id: USER_B })
    expect(r.data.clients.map((c: Row) => c.name)).toEqual(['Alice of A'])
  })

  it('every data query is filtered by the token user and excludes Trash', async () => {
    tables.mcp_tokens[1].categories = [...MCP_CATEGORIES]
    fake.log.length = 0
    for (const t of TOOLS) await callTool(TOKENS.b, t.name, SAMPLE_ARGS[t.name] ?? {})
    const dataQueries = fake.log.filter((q) => q.table !== 'mcp_tokens')
    expect(dataQueries.length).toBeGreaterThan(20)
    for (const q of dataQueries) expect(q.filters, q.table).toContain(`eq:user_id=${USER_B}`)
    expect(fake.log.filter((q) => q.table === 'clients').every((q) => q.filters.includes('is:deleted_at=null'))).toBe(true)
  })

  it('soft-deleted rows are not returned', async () => {
    const r = await callTool(TOKENS.a, 'list_clients')
    expect(r.data.clients.map((c: Row) => c.name)).not.toContain('Trashed of A')
  })
})

// ── Output safety ────────────────────────────────────────────────────
const SAMPLE_ARGS: Record<string, Row> = {
  get_client: { client_id: id(3) },
  get_contact_details: { client_ids: [id(3)], lead_ids: [id(50)], booking_ids: [id(60)], transaction_ids: [id(21)] },
  get_client_notes: { client_ids: [id(3)], lead_ids: [id(50)] },
  get_calendar_event_titles: { from: '2026-01-01', to: '2100-01-01' },
  list_upcoming: { from: '2026-01-01', to: '2100-01-01' },
  list_finance_records: { kind: 'adjustments' },
  get_tax_ids: { transaction_ids: [id(21)] },
}

function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out) }
  return out
}

describe('output safety', () => {
  it('no forbidden field appears in any tool output', async () => {
    tables.mcp_tokens[1].categories = [...MCP_CATEGORIES]
    for (const t of TOOLS) {
      const r = await callTool(TOKENS.b, t.name, SAMPLE_ARGS[t.name] ?? {})
      expect(r.isError, `${t.name}: ${r.text}`).toBe(false)
      for (const k of keysDeep(r.data)) expect(FORBIDDEN_COLUMNS.has(k), `${t.name} leaked ${k}`).toBe(false)
      expect(r.text, t.name).not.toContain('SECRET')
    }
  })

  it('the 200-row cap holds even when more is asked for', async () => {
    tables.clients = Array.from({ length: 250 }, (_, i) => row(1000 + i, USER_A, { name: `C${String(i).padStart(3, '0')}` }))
    const r = await callTool(TOKENS.a, 'list_clients', { limit: 1000 })
    expect(r.data.clients).toHaveLength(200)
    expect(r.data.truncated).toBe(true)
  })

  it('sensitive fields are read only by tools of their own sensitive category', async () => {
    // Record what each tool reads (table + columns) by running it directly.
    const reads = new Map<string, Array<{ table: string; columns: readonly string[] }>>()
    for (const t of TOOLS) {
      const list: Array<{ table: string; columns: readonly string[] }> = []
      const ctx: ToolContext = {
        args: SAMPLE_ARGS[t.name] ?? {},
        read: async (spec) => { list.push({ table: spec.table, columns: spec.columns }); return [] },
        categories: [...MCP_CATEGORIES], expiresAt: FUTURE,
      }
      await t.run(ctx)
      reads.set(t.name, list)
    }
    const LINK = new Set(['id', 'client_id', 'group_id', 'date', 'start_time'])
    const sensitive = new Set<string>()
    for (const t of TOOLS.filter((t) => t.category && SENSITIVE_CATEGORIES.has(t.category))) {
      for (const r of reads.get(t.name)!) for (const c of r.columns) if (!LINK.has(c)) sensitive.add(`${r.table}.${c}`)
    }
    expect(sensitive.size).toBeGreaterThan(10)
    for (const t of TOOLS.filter((t) => !t.category || !SENSITIVE_CATEGORIES.has(t.category))) {
      for (const r of reads.get(t.name)!) {
        for (const c of r.columns) expect(sensitive.has(`${r.table}.${c}`), `${t.name} reads sensitive ${r.table}.${c}`).toBe(false)
      }
    }
  })

  it('list_finance_records reads only finance tables, and only columns no other category reads', async () => {
    const FINANCE_ONLY_TABLES = new Set(['recurring_templates', 'client_adjustments', 'investments'])
    // Every (table.column) read by a non-finance tool.
    const otherReads = new Set<string>()
    for (const t of TOOLS.filter((t) => t.category !== 'finance')) {
      const ctx: ToolContext = {
        args: SAMPLE_ARGS[t.name] ?? {},
        read: async (spec) => { spec.columns.forEach((c) => otherReads.add(`${spec.table}.${c}`)); return [] },
        categories: [...MCP_CATEGORIES], expiresAt: FUTURE,
      }
      await t.run(ctx)
    }
    const tool = TOOLS.find((t) => t.name === 'list_finance_records')!
    for (const kind of ['recurring', 'adjustments', 'investments']) {
      const seen: Array<{ table: string; columns: readonly string[] }> = []
      await tool.run({ args: { kind }, read: async (s) => { seen.push(s); return [] }, categories: ['finance'], expiresAt: FUTURE })
      expect(seen.length).toBe(1)
      for (const s of seen) {
        expect(FINANCE_ONLY_TABLES.has(s.table), `${kind} reads ${s.table}`).toBe(true)
        for (const c of s.columns) {
          expect(c).not.toBe('recipient_tax_id')
          expect(otherReads.has(`${s.table}.${c}`), `${kind}: ${s.table}.${c} is read by another category`).toBe(false)
        }
      }
    }
  })

  it('get_finance_summary returns aggregates only, even over 5,000 scanned rows', async () => {
    tables.mcp_tokens[1].categories = ['finance']
    tables.transactions = Array.from({ length: 5200 }, (_, i) => row(20_000 + i, USER_B, {
      amount: 10, type: i % 2 ? 'income' : 'expense', status: 'confirmed',
      date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`, desc: `RAW-ROW-${i}`, client_id: id(3),
      recipient_tax_id: 'TAX', recipient_name: 'NAME',
    }))
    const r = await callTool(TOKENS.b, 'get_finance_summary', { group_by: 'month' })
    expect(r.isError).toBe(false)
    expect(r.data.transactions_scanned).toBe(5000)
    expect(r.data.complete).toBe(false)
    expect(r.data.rows.length).toBeLessThanOrEqual(24)          // 12 months × 2 types × 1 status
    const allowed = new Set(['group_by', 'rows', 'transactions_scanned', 'complete', 'group', 'type', 'status', 'total', 'count'])
    for (const k of keysDeep(r.data)) expect(allowed.has(k), `unexpected key ${k}`).toBe(true)
    expect(r.text).not.toMatch(/RAW-ROW|TAX|NAME|SECRET/)
    expect(r.text).not.toContain(id(3))
    expect(r.data.rows.reduce((n: number, x: Row) => n + Number(x.count), 0)).toBe(5000)
  })

  it('finance tools return client ids, not names', async () => {
    tables.mcp_tokens[1].categories = ['finance']
    const r = await callTool(TOKENS.b, 'list_transactions')
    expect(r.data.transactions[0].client_id).toBe(id(3))
    expect(r.text).not.toContain('Bob of B')
  })

  it('calendar events are busy time only in list_upcoming; titles only via their own tool', async () => {
    tables.mcp_tokens[1].categories = ['meetings']
    const r = await callTool(TOKENS.b, 'list_upcoming', SAMPLE_ARGS.list_upcoming)
    expect(r.data.calendar_busy[0]).toEqual({ id: id(40), start_time: '2099-01-01T10:00:00Z', end_time: '2099-01-01T11:00:00Z', all_day: null, client_id: id(3) })
    expect(r.text).not.toContain('Therapy')
    expect((await callTool(TOKENS.b, 'get_calendar_event_titles', SAMPLE_ARGS.get_calendar_event_titles)).text).toMatch(/not enabled/)
  })
})
