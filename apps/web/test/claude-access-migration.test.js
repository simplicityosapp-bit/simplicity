/* ════════════════════════════════════════════════════════════════
   CLAUDE-ACCESS MIGRATION — runs supabase/migrations/0109_mcp_tokens.sql on a
   real Postgres engine (PGlite: Postgres compiled to WASM, in memory) and
   checks the token + consent rules the database itself must enforce. No
   network, no Supabase project, no real data.
   Run: npm test   (or just this file: npm run test:db)
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const here = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(here, '..', '..', '..', 'supabase', 'migrations', '0109_mcp_tokens.sql'), 'utf8')

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const U3 = '33333333-3333-4333-8333-333333333333'
const V = '2026-10-11'
const H = (n) => n.toString(16).padStart(64, '0')

let db
const q = async (s, p = []) => (await db.query(s, p)).rows
const fails = async (s, p = []) => { try { await db.query(s, p); return null } catch (e) { return e.message } }
const issue = (user, n, cats, v = V) => q('SELECT * FROM mcp_token_issue($1, $2, $3::text[], $4)', [user, H(n), cats, v])
const upd = (user, cats, v = null) =>
  q('SELECT * FROM mcp_token_update_categories($1, $2::text[], $3)', [user, cats, v]).then((r) => r[0])
const active = (user) => q('SELECT * FROM mcp_tokens WHERE user_id = $1 AND revoked_at IS NULL', [user]).then((r) => r[0])
const sorted = (a) => [...a].sort()

beforeAll(async () => {
  db = new PGlite()
  // The Supabase pieces the migration expects.
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  `)
  await db.query('INSERT INTO auth.users VALUES ($1), ($2), ($3)', [U1, U2, U3])
  await db.exec(SQL)
}, 60_000)

afterAll(async () => { await db?.close() })

describe('0109 — applies cleanly', () => {
  it('re-running is a no-op', async () => {
    await db.exec(SQL)
  })
  it('no table grants to anon / authenticated / PUBLIC', async () => {
    const g = await q(`SELECT grantee FROM information_schema.role_table_grants
                        WHERE table_name = 'mcp_tokens' AND grantee IN ('anon','authenticated','PUBLIC')`)
    expect(g).toEqual([])
  })
  it('the token functions are executable by service_role only', async () => {
    const fx = await q(`SELECT p.proname,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') a,
        has_function_privilege('anon', p.oid, 'EXECUTE') n,
        has_function_privilege('service_role', p.oid, 'EXECUTE') s
      FROM pg_proc p WHERE p.proname IN ('mcp_token_issue', 'mcp_token_update_categories')`)
    expect(fx).toHaveLength(2)
    for (const f of fx) expect([f.a, f.n, f.s], f.proname).toEqual([false, false, true])
  })
})

describe('0109 — create', () => {
  it('stores the full consent record with the token', async () => {
    await issue(U1, 1, ['clients', 'journal'])
    const a = await active(U1)
    expect(a.consent_version).toBe(V)
    expect(a.consented_at).toBeTruthy()
    expect(a.first_consented_at).toBeTruthy()
    expect(a.consented_categories).toEqual(['clients', 'journal'])
  })
  it('refuses a create without a consent version', async () => {
    expect(await fails('SELECT * FROM mcp_token_issue($1, $2, $3::text[], NULL)', [U2, H(90), ['clients']])).toBeTruthy()
  })
  it('replaces the previous token atomically — one active row', async () => {
    await issue(U1, 2, ['clients'])
    const [r] = await q(`SELECT count(*)::int n, count(*) FILTER (WHERE revoked_at IS NULL)::int act
                          FROM mcp_tokens WHERE user_id = $1`, [U1])
    expect(r).toEqual({ n: 2, act: 1 })
  })
  it('refuses unknown category keys and an empty list', async () => {
    expect(await fails(`SELECT * FROM mcp_token_issue($1, $2, ARRAY['clients','everything']::text[], $3)`, [U2, H(91), V])).toBeTruthy()
    expect(await fails('SELECT * FROM mcp_token_issue($1, $2, ARRAY[]::text[], $3)', [U2, H(92), V])).toBeTruthy()
  })
})

describe('0109 — update-categories and re-consent', () => {
  it('adding a NON-sensitive new category without consent is refused, nothing changes', async () => {
    const r = await upd(U1, ['clients', 'tasks'])
    expect(r.result).toBe('consent_required')
    expect(r.missing).toEqual(['tasks'])
    expect((await active(U1)).categories).toEqual(['clients'])
  })
  it('adding a sensitive new category without consent is refused', async () => {
    const r = await upd(U1, ['clients', 'session_notes'])
    expect(r.result).toBe('consent_required')
    expect(r.missing).toEqual(['session_notes'])
  })
  it('with consent: one update grows categories and consent; first_consented_at stays', async () => {
    const before = await active(U1)
    await new Promise((res) => setTimeout(res, 20))
    const r = await upd(U1, ['clients', 'journal', 'tasks'], V)
    const a = await active(U1)
    expect(r.result).toBe('ok')
    expect(a.categories).toEqual(['clients', 'journal', 'tasks'])
    expect(sorted(a.consented_categories)).toEqual(['clients', 'journal', 'tasks'])
    expect(a.first_consented_at.toISOString()).toBe(before.first_consented_at.toISOString())
    expect(a.consented_at.getTime()).toBeGreaterThan(before.consented_at.getTime())
  })
  it('removing categories needs no consent, and consented_categories does not shrink', async () => {
    const r = await upd(U1, ['clients'])
    const a = await active(U1)
    expect(r.result).toBe('ok')
    expect(a.categories).toEqual(['clients'])
    expect(sorted(a.consented_categories)).toEqual(['clients', 'journal', 'tasks'])
  })
  it('re-adding an already-consented category needs no consent', async () => {
    expect((await upd(U1, ['clients', 'journal'])).result).toBe('ok')
  })
  it('old consent text on the token: renew fine and untouched; adding needs consent; re-choosing does not', async () => {
    await db.query(`UPDATE mcp_tokens SET consent_version = '2020-01-01' WHERE user_id = $1 AND revoked_at IS NULL`, [U1])
    expect(await fails(`UPDATE mcp_tokens SET expires_at = now() + interval '90 days'
                         WHERE user_id = $1 AND revoked_at IS NULL`, [U1])).toBeNull()
    expect((await active(U1)).consent_version).toBe('2020-01-01')
    expect((await upd(U1, ['clients', 'finance'])).result).toBe('consent_required')
    expect((await upd(U1, ['clients', 'journal', 'tasks'])).result).toBe('ok')
    expect((await active(U1)).consent_version).toBe('2020-01-01')
  })
  it('no active token → no_active_token', async () => {
    expect((await upd(U3, ['clients'])).result).toBe('no_active_token')
  })
  it("one user's update never touches another user's token", async () => {
    await issue(U2, 3, ['finance'])
    await upd(U2, ['finance'])
    expect((await active(U1)).categories).toEqual(['clients', 'journal', 'tasks'])
    expect((await active(U2)).categories).toEqual(['finance'])
  })
})

describe('0109 — guards the DB enforces even if code were wrong', () => {
  it('categories outside consented_categories are refused', async () => {
    expect(await fails(`UPDATE mcp_tokens SET categories = ARRAY['clients','finance']
                         WHERE user_id = $1 AND revoked_at IS NULL`, [U1])).toBeTruthy()
  })
  it('consented_categories can never shrink', async () => {
    expect(await fails(`UPDATE mcp_tokens SET consented_categories = ARRAY['clients'], categories = ARRAY['clients']
                         WHERE user_id = $1 AND revoked_at IS NULL`, [U1])).toMatch(/shrink/)
  })
  it('first_consented_at can never change', async () => {
    expect(await fails(`UPDATE mcp_tokens SET first_consented_at = now()
                         WHERE user_id = $1 AND revoked_at IS NULL`, [U1])).toMatch(/immutable/)
  })
})

describe('0109 — limits and lifecycle', () => {
  it('a 6th create within an hour is rate limited', async () => {
    // U2 has 1 row; four more are allowed, the sixth is not.
    for (let i = 0; i < 4; i++) await issue(U2, 10 + i, ['finance'])
    expect(await fails(`SELECT * FROM mcp_token_issue($1, $2, ARRAY['finance']::text[], $3)`, [U2, H(20), V]))
      .toMatch(/mcp_token_rate_limited/)
  })
  it('deleting the account deletes its token rows and consent record', async () => {
    await db.query('DELETE FROM auth.users WHERE id = $1', [U2])
    expect((await q('SELECT count(*)::int n FROM mcp_tokens WHERE user_id = $1', [U2]))[0].n).toBe(0)
  })
})
