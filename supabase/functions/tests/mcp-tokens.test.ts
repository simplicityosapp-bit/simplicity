// mcp-tokens handler against a fake store. No network, no database.
import { CONSENT_VERSION } from '../_shared/mcp-categories.ts'
import { handleRequest, resetRateLimits, sha256Hex } from '../mcp-tokens/handler.ts'
import type { Store, TokenRow } from '../mcp-tokens/store.ts'

const USER = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002'
const FUTURE = new Date(Date.now() + 90 * 86_400_000).toISOString()

type IssueArgs = Parameters<Store['issue']>[0]

// The fake mirrors mcp_token_update_categories' rule so the handler's mapping
// can be tested; the rule itself is verified against real Postgres separately.
function fakeStore(over: Partial<Store> = {}) {
  const calls = { issue: [] as IssueArgs[], updateCategories: [] as unknown[][], renew: [] as unknown[][], revoke: [] as unknown[] }
  let row: TokenRow | null = null
  const store: Store = {
    activeRow: async () => row,
    issue: async (a) => {
      calls.issue.push(a)
      row = { categories: a.categories, consented_categories: a.categories, created_at: new Date().toISOString(), expires_at: FUTURE, last_used_at: null }
      return 'ok'
    },
    updateCategories: async (u, c, cv) => {
      calls.updateCategories.push([u, c, cv])
      if (!row) return { result: 'no_active_token' }
      const missing = c.filter((k) => !row!.consented_categories.includes(k))
      if (missing.length && !cv) return { result: 'consent_required', missing }
      row = { ...row, categories: c, consented_categories: [...row.consented_categories, ...missing] }
      return { result: 'ok', row }
    },
    renew: async (u, e) => { calls.renew.push([u, e]); return row && { ...row, expires_at: e } },
    revoke: async (u) => { calls.revoke.push(u); row = null },
    ...over,
  }
  return { store, calls }
}

async function call(store: Store, body: Record<string, unknown>, user: string | null = USER) {
  const res = await handleRequest(new Request('https://x/functions/v1/mcp-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  }), { getUserId: async () => user, store, mcpUrl: 'https://x/functions/v1/claude-mcp' })
  return { status: res.status, body: await res.json(), headers: res.headers }
}

beforeEach(() => resetRateLimits())

describe('mcp-tokens: consent on create', () => {
  it('rejects create without a consent version, and creates nothing', async () => {
    const { store, calls } = fakeStore()
    const r = await call(store, { action: 'create', categories: ['clients'] })
    expect(r.status).toBe(400)
    expect(r.body).toEqual({ error: 'consent_required' })
    expect(calls.issue).toHaveLength(0)
  })

  it('rejects a stale or wrong consent version', async () => {
    const { store, calls } = fakeStore()
    for (const v of ['2020-01-01', '', null, 123, CONSENT_VERSION + 'x']) {
      resetRateLimits() // 5 creates in a row would otherwise trip the 3/min limit
      const r = await call(store, { action: 'create', categories: ['clients'], consent_version: v })
      expect(r.body, String(v)).toEqual({ error: 'consent_required' })
    }
    expect(calls.issue).toHaveLength(0)
  })

  it('with the current version: issues atomically with the consent version, returns the token once', async () => {
    const { store, calls } = fakeStore()
    const r = await call(store, { action: 'create', categories: ['journal', 'clients'], consent_version: CONSENT_VERSION, user_id: OTHER })
    expect(r.status).toBe(200)
    expect(r.body.token).toMatch(/^smp_[A-Za-z0-9_-]{43}$/)
    expect(calls.issue).toHaveLength(1)
    expect(calls.issue[0]).toEqual({
      userId: USER,                                   // from the JWT, not the body
      tokenHash: await sha256Hex(r.body.token),
      categories: ['clients', 'journal'],             // validated + canonical order
      consentVersion: CONSENT_VERSION,
    })
    expect(r.headers.get('cache-control')).toBe('no-store')
  })

  it('validates categories before anything else', async () => {
    const { store, calls } = fakeStore()
    const r = await call(store, { action: 'create', categories: [], consent_version: CONSENT_VERSION })
    expect(r.body).toEqual({ error: 'invalid_categories' })
    expect(calls.issue).toHaveLength(0)
  })

  it('maps the DB creation limit to rate_limited', async () => {
    const { store } = fakeStore({ issue: async () => 'rate_limited' })
    const r = await call(store, { action: 'create', categories: ['clients'], consent_version: CONSENT_VERSION })
    expect(r.status).toBe(429)
    expect(r.body).toEqual({ error: 'rate_limited' })
  })
})

describe('mcp-tokens: other actions', () => {
  it('unauthenticated → 401, nothing touched', async () => {
    const { store, calls } = fakeStore()
    const r = await call(store, { action: 'create', categories: ['clients'], consent_version: CONSENT_VERSION }, null)
    expect(r.status).toBe(401)
    expect(calls.issue).toHaveLength(0)
  })

  it('renew never issues a token and never sends consent', async () => {
    const { store, calls } = fakeStore()
    await call(store, { action: 'create', categories: ['clients'], consent_version: CONSENT_VERSION })
    const r = await call(store, { action: 'renew', consent_version: 'whatever' })
    expect(r.status).toBe(200)
    expect(calls.issue).toHaveLength(1)
    expect(calls.renew).toEqual([[USER, expect.any(String)]])
  })
})

describe('mcp-tokens: update-categories and re-consent', () => {
  const created = async () => {
    const f = fakeStore()
    await call(f.store, { action: 'create', categories: ['clients', 'journal'], consent_version: CONSENT_VERSION })
    return f
  }

  it('adding a NON-sensitive category without consent → 409 with the missing keys', async () => {
    const { store, calls } = await created()
    const r = await call(store, { action: 'update-categories', categories: ['clients', 'journal', 'tasks'] })
    expect(r.status).toBe(409)
    expect(r.body).toEqual({ error: 'consent_required', missing: ['tasks'] })
    expect(calls.updateCategories[0]).toEqual([USER, ['clients', 'tasks', 'journal'], null])
    expect((await call(store, { action: 'status' })).body.status.categories).toEqual(['clients', 'journal'])
  })

  it('adding a sensitive category without consent → 409', async () => {
    const { store } = await created()
    const r = await call(store, { action: 'update-categories', categories: ['clients', 'session_notes'] })
    expect(r.body).toEqual({ error: 'consent_required', missing: ['session_notes'] })
  })

  it('a stale consent version counts as no consent', async () => {
    const { store, calls } = await created()
    const r = await call(store, { action: 'update-categories', categories: ['clients', 'tasks'], consent_version: '2020-01-01' })
    expect(r.status).toBe(409)
    expect(calls.updateCategories[0][2]).toBeNull()
  })

  it('with the current version the addition passes, and the consent grows', async () => {
    const { store, calls } = await created()
    const r = await call(store, { action: 'update-categories', categories: ['clients', 'tasks'], consent_version: CONSENT_VERSION })
    expect(r.status).toBe(200)
    expect(calls.updateCategories[0][2]).toBe(CONSENT_VERSION)
    expect(r.body.status.categories).toEqual(['clients', 'tasks'])
    expect([...r.body.status.consented_categories].sort()).toEqual(['clients', 'journal', 'tasks'])
  })

  it('removing, then re-adding an already-consented category needs no consent', async () => {
    const { store } = await created()
    expect((await call(store, { action: 'update-categories', categories: ['clients'] })).status).toBe(200)
    const back = await call(store, { action: 'update-categories', categories: ['clients', 'journal'] })
    expect(back.status).toBe(200)
    expect(back.body.status.categories).toEqual(['clients', 'journal'])
  })

  it('consented_categories never shrinks through the API', async () => {
    const { store } = await created()
    const r = await call(store, { action: 'update-categories', categories: ['clients'] })
    expect([...r.body.status.consented_categories].sort()).toEqual(['clients', 'journal'])
  })

  it('no active token → 404', async () => {
    const { store } = fakeStore()
    const r = await call(store, { action: 'update-categories', categories: ['clients'] })
    expect(r.status).toBe(404)
    expect(r.body).toEqual({ error: 'no_active_token' })
  })

  it('status never carries the token or a hash', async () => {
    const { store } = fakeStore()
    const created = await call(store, { action: 'create', categories: ['clients'], consent_version: CONSENT_VERSION })
    const s = await call(store, { action: 'status' })
    const text = JSON.stringify(s.body)
    expect(text).not.toContain(created.body.token)
    expect(text).not.toContain(await sha256Hex(created.body.token))
    expect(Object.keys(s.body.status).sort()).toEqual(['active', 'categories', 'consented_categories', 'created_at', 'expired', 'expires_at', 'last_used_at'])
  })

  it('an internal error logs neither the token nor its hash, and answers server_error', async () => {
    let issued = ''
    const { store } = fakeStore({
      issue: async (a) => { issued = a.tokenHash; return 'ok' },
      activeRow: async () => { throw Object.assign(new Error('db exploded smp_'), { code: 'XX000' }) },
    })
    const logs: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
    const r = await call(store, { action: 'create', categories: ['clients'], consent_version: CONSENT_VERSION })
    spy.mockRestore()
    expect(r.status).toBe(500)
    expect(r.body).toEqual({ error: 'server_error' })
    expect(logs.join('\n')).not.toContain(issued)
    expect(logs.join('\n')).not.toMatch(/smp_[A-Za-z0-9_-]{20,}/)
    expect(logs).toEqual(['mcp-tokens create failed: XX000'])
  })
})
