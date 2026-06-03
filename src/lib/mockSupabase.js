/* ════════════════════════════════════════════════════════════════
   MOCK SUPABASE CLIENT — dev/preview only, never shipped to prod.
   ════════════════════════════════════════════════════════════════
   A drop-in stand-in for the real `supabase` client that lets the app
   render the logged-in UI with the existing src/data/mock.js fixtures —
   no real auth, no network, no password. Enabled only in DEV when the
   URL carries `?mock=1` or localStorage `PREVIEW_MOCK==='1'` (see
   lib/supabase.js). Purpose: visual verification of UI changes when an
   interactive login isn't available.

   The query builder is a Proxy: every PostgREST filter/modifier
   (select/eq/is/order/in/gte/…) is a chainable no-op, and awaiting the
   chain resolves to the table's mock rows. Filters are intentionally
   ignored — the fixtures are single-user and non-deleted, so returning
   the whole table is correct for rendering. Writes mutate the in-memory
   fixtures so interactions (toggle a question, complete a reminder, add
   an answer) reflect live until reload.
   ════════════════════════════════════════════════════════════════ */

import { MOCK_DB } from '../data/mock'
import { defaultPreferences } from './preferences'

const uuid = () =>
  (globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'mock-' + Math.random().toString(16).slice(2))

const FAKE_SESSION = {
  access_token: 'mock-access-token',
  token_type: 'bearer',
  expires_in: 999999,
  expires_at: Math.floor(8640000000000 / 1000),
  refresh_token: 'mock-refresh-token',
  user: {
    id: 'mock-user-001', // matches USER in src/data/mock.js so inserts attach correctly
    aud: 'authenticated',
    role: 'authenticated',
    email: 'preview@simplicity.dev',
    app_metadata: { provider: 'mock' },
    user_metadata: { full_name: 'מאמן/ת לדוגמה' },
  },
}

/* Preferences live in a JSONB `preferences` column. Seed a full default
   blob with onboarding marked complete so the AppShell releases to /home
   instead of forcing the onboarding wizard. */
let MOCK_PREFS = (() => {
  const p = defaultPreferences()
  p.onboarding = { ...p.onboarding, welcome_seen: true, completed_at: new Date().toISOString() }
  return p
})()

function computeResult(state) {
  const { table, op, payload, eqs, single } = state

  /* user_preferences is special: the row wraps the blob in `.preferences`. */
  if (table === 'user_preferences') {
    if (op === 'update' || op === 'insert' || op === 'upsert') {
      const next = payload?.preferences
      if (next && typeof next === 'object') MOCK_PREFS = next
      return { data: { preferences: MOCK_PREFS }, error: null }
    }
    const row = { user_id: FAKE_SESSION.user.id, preferences: MOCK_PREFS }
    return { data: single ? row : [row], error: null }
  }

  const src = MOCK_DB[table]
  const arr = Array.isArray(src) ? src : src ? [src] : []
  const matches = (row) => eqs.every(([c, v]) => row[c] === v)

  if (op === 'insert' || op === 'upsert') {
    /* Content signature (ignoring server-owned id/timestamps) so that
       generation hooks re-running under React StrictMode don't pile up
       duplicate rows — the real DB's unique constraints would reject them. */
    const sig = (r) => { const { id, created_at, updated_at, ...rest } = r; return JSON.stringify(rest) }
    const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
      id: uuid(),
      created_at: new Date().toISOString(),
      ...r,
    }))
    if (Array.isArray(src)) {
      const seen = new Set(src.map(sig))
      rows.forEach((r) => { if (!seen.has(sig(r))) { src.push(r); seen.add(sig(r)) } })
    }
    return { data: single ? rows[0] ?? null : rows, error: null }
  }

  if (op === 'update') {
    const updated = []
    arr.forEach((row) => {
      if (matches(row)) { Object.assign(row, payload); updated.push(row) }
    })
    return { data: single ? updated[0] ?? null : updated, error: null }
  }

  if (op === 'delete') {
    if (Array.isArray(src)) MOCK_DB[table] = src.filter((row) => !matches(row))
    return { data: null, error: null }
  }

  /* select — return a fresh array of fresh row copies so a hook can't alias
     and mutate the live fixtures (which would duplicate rows alongside the
     hook's own optimistic updates). */
  if (single) return { data: arr[0] ? { ...arr[0] } : null, error: null }
  return { data: arr.map((r) => ({ ...r })), error: null }
}

function makeQuery(table) {
  const state = { table, op: 'select', payload: null, eqs: [], single: false }

  const handler = {
    get(_t, prop) {
      switch (prop) {
        case 'then':
          return (resolve, reject) =>
            Promise.resolve(computeResult(state)).then(resolve, reject)
        case 'single':
        case 'maybeSingle':
          return () => { state.single = true; return proxy }
        case 'csv':
          return () => proxy
        case 'insert':
        case 'upsert':
          return (payload) => { state.op = prop; state.payload = payload; return proxy }
        case 'update':
          return (payload) => { state.op = 'update'; state.payload = payload; return proxy }
        case 'delete':
          return () => { state.op = 'delete'; return proxy }
        case 'eq':
          return (col, val) => { state.eqs.push([col, val]); return proxy }
        default:
          /* every other filter/modifier (select, order, is, not, gte, in,
             limit, range, neq, ilike, or, match, …) is a chainable no-op. */
          return () => proxy
      }
    },
  }
  const proxy = new Proxy({}, handler)
  return proxy
}

const noopChannel = {
  on() { return this },
  subscribe() { return this },
  unsubscribe() { return Promise.resolve('ok') },
}

export function makeMockClient() {
  return {
    from: (table) => makeQuery(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
    functions: { invoke: async () => ({ data: { ok: true }, error: null }) },
    channel: () => noopChannel,
    removeChannel: () => Promise.resolve('ok'),
    removeAllChannels: () => Promise.resolve('ok'),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        download: async () => ({ data: null, error: null }),
        remove: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    auth: {
      getSession: async () => ({ data: { session: FAKE_SESSION }, error: null }),
      getUser: async () => ({ data: { user: FAKE_SESSION.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { session: FAKE_SESSION, user: FAKE_SESSION.user }, error: null }),
      signInWithOAuth: async () => ({ data: { provider: 'mock', url: null }, error: null }),
      signUp: async () => ({ data: { session: FAKE_SESSION, user: FAKE_SESSION.user }, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
    },
  }
}
