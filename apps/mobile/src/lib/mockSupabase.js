/* ════════════════════════════════════════════════════════════════
   MOCK SUPABASE CLIENT — dev/preview only (react-native-web).
   ════════════════════════════════════════════════════════════════
   A drop-in stand-in for the real client so the preview renders the
   logged-in app with the src/data/mock.js fixtures — no auth, no
   network. Enabled only in DEV when localStorage PREVIEW_MOCK==='1'
   (see lib/supabase.js). Lets us verify + polish the POPULATED UI when
   an interactive login isn't available. Adapted from apps/web/src/lib/
   mockSupabase.js (minus web-only functions/admin fixtures).

   The query builder is a Proxy: every PostgREST filter/modifier is a
   chainable no-op, awaiting the chain resolves to the table's rows.
   Filters are ignored (fixtures are single-user, non-deleted). Writes
   mutate the in-memory fixtures so interactions stick until reload.
   ════════════════════════════════════════════════════════════════ */
import { MOCK_DB } from '../data/mock'

const uuid = () => (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : 'mock-' + Math.random().toString(16).slice(2))

const FAKE_SESSION = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 999999,
  expires_at: Math.floor(8640000000000 / 1000),
  refresh_token: 'mock-refresh-token',
  user: { id: 'mock-user-001', aud: 'authenticated', role: 'authenticated', email: 'demo@simplicity.local', app_metadata: { provider: 'mock' }, user_metadata: { full_name: 'מאמן/ת לדוגמה' } },
}

function computeResult(state) {
  const { table, op, payload, eqs, single } = state
  const src = MOCK_DB[table]
  const arr = Array.isArray(src) ? src : src ? [src] : []
  const matches = (row) => eqs.every(([c, v]) => row[c] === v)

  if (op === 'insert' || op === 'upsert') {
    const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: uuid(), created_at: new Date().toISOString(), ...r }))
    if (Array.isArray(src)) rows.forEach((r) => src.unshift(r))
    return { data: single ? rows[0] ?? null : rows, error: null }
  }
  if (op === 'update') {
    const updated = []
    arr.forEach((row) => { if (matches(row)) { Object.assign(row, payload); updated.push(row) } })
    return { data: single ? updated[0] ?? null : updated, error: null }
  }
  if (op === 'delete') {
    if (Array.isArray(src)) MOCK_DB[table] = src.filter((row) => !matches(row))
    return { data: null, error: null }
  }
  // select — fresh copies so hooks can't alias + mutate the live fixtures.
  if (single) return { data: arr[0] ? { ...arr[0] } : null, error: null }
  return { data: arr.map((r) => ({ ...r })), error: null }
}

function makeQuery(table) {
  const state = { table, op: 'select', payload: null, eqs: [], single: false }
  const handler = {
    get(_t, prop) {
      switch (prop) {
        case 'then': return (resolve, reject) => Promise.resolve(computeResult(state)).then(resolve, reject)
        case 'single':
        case 'maybeSingle': return () => { state.single = true; return proxy }
        case 'insert':
        case 'upsert': return (payload) => { state.op = prop; state.payload = payload; return proxy }
        case 'update': return (payload) => { state.op = 'update'; state.payload = payload; return proxy }
        case 'delete': return () => { state.op = 'delete'; return proxy }
        case 'eq': return (col, val) => { state.eqs.push([col, val]); return proxy }
        default: return () => proxy // every other filter/modifier is a chainable no-op
      }
    },
  }
  const proxy = new Proxy({}, handler)
  return proxy
}

export function makeMockClient() {
  return {
    from: (table) => makeQuery(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
    functions: { invoke: async () => ({ data: null, error: null }) },
    channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() { return Promise.resolve('ok') } }),
    removeChannel: () => Promise.resolve('ok'),
    auth: {
      getSession: async () => ({ data: { session: FAKE_SESSION }, error: null }),
      getUser: async () => ({ data: { user: FAKE_SESSION.user }, error: null }),
      onAuthStateChange: (cb) => { setTimeout(() => cb?.('SIGNED_IN', FAKE_SESSION), 0); return { data: { subscription: { unsubscribe() {} } } } },
      signInWithPassword: async () => ({ data: { session: FAKE_SESSION, user: FAKE_SESSION.user }, error: null }),
      signOut: async () => ({ error: null }),
    },
  }
}
