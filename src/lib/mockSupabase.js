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
    // The owner email, so the /admin gate passes in preview. DEV-only mock;
    // tree-shaken from production. Lets us verify the admin console locally.
    email: 'simplicity.os.app@gmail.com',
    app_metadata: { provider: 'mock' },
    user_metadata: { full_name: 'מאמן/ת לדוגמה', privacy_version: '1.0', dpa_version: '1.0', terms_version: '1.0', marketing_consent: true },
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

/* ── Admin console fixtures (preview only) ──────────────────────────
   The real /admin screens call the `admin` edge function, which can't
   run under the mock. We synthesise a believable dataset once so the
   console renders end-to-end in preview. Built lazily + cached so a
   status change (feedback_update_status) sticks until reload. */
const dayISO = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
const STEP_LABELS = ['פרופיל', 'ייבוא נתונים', 'פרויקטים', 'לקוחות', 'שאלות יומיות', 'יעדים', 'הוראות קבע', 'תצוגה מקדימה', 'סיום']

let MOCK_ADMIN = null
function adminFixtures() {
  if (MOCK_ADMIN) return MOCK_ADMIN
  const names = ['dana', 'yossi', 'maya', 'avi', 'noa', 'tom', 'rina', 'omer', 'lior', 'shira', 'gal', 'eden']
  const users = names.map((n, i) => ({
    id: `u${i}`,
    email: `${n}@example.com`,
    created_at: dayISO(-(i * 6 + 2)),
    last_sign_in_at: i % 5 === 0 ? dayISO(-20) : dayISO(-(i % 7)),
    onboarding_index: i === 0 ? 9 : (i % 9),
    onboarding_label: i === 0 ? 'הושלם' : STEP_LABELS[i % 9],
    onboarding_done: i === 0,
    reflections: Math.max(0, 14 - i * 2),
    sessions: Math.max(0, 30 - i * 3),
    feedback_count: i % 3 === 0 ? 1 : 0,
    marketing_consent: i % 2 === 0,
    // Durable user_consent summary (latest per kind). Last user hasn't
    // re-accepted terms yet → renders "—" in the detail.
    consent: {
      privacy: { version: '1.0', accepted: true, accepted_at: dayISO(-(i * 6 + 2)) },
      dpa: { version: '1.0', accepted: true, accepted_at: dayISO(-(i * 6 + 2)) },
      ...(i === names.length - 1 ? {} : { terms: { version: '1.0', accepted: true, accepted_at: dayISO(-(i % 4)) } }),
      marketing: { version: null, accepted: i % 2 === 0, accepted_at: dayISO(-(i * 6 + 2)) },
    },
    // Preview seed: user 0 = real (paid) subscriber, user 1 = manual.
    _paid: i === 0,
    _manual: i === 1,
  }))
  const feedback = [
    { type: 'bug', status: 'new', message: 'הכפתור של הוספת לקוח לא נפתח במובייל.' },
    { type: 'idea', status: 'new', message: 'אשמח לראות ייצוא לאקסל של הדוחות.' },
    { type: 'praise', status: 'in_progress', message: 'אפליקציה מהממת, עוזרת לי כל יום!' },
    { type: 'bug', status: 'done', message: 'תאריך הפגישה הוצג לא נכון.' },
    { type: 'other', status: 'new', message: 'איך מוחקים קבוצה?' },
    { type: 'idea', status: 'in_progress', message: 'תזכורות גם בוואטסאפ יהיה אדיר.' },
  ].map((f, i) => ({ id: `f${i}`, email: users[i % users.length].email, created_at: dayISO(-i), ...f }))

  const buckets = (days, max) => {
    const out = []
    for (let d = days; d >= 0; d--) out.push({ date: dayISO(-d), count: Math.round(Math.abs(Math.sin(d)) * max) })
    return out
  }
  MOCK_ADMIN = { users, feedback, buckets }
  return MOCK_ADMIN
}

function adminInvoke(body) {
  const { action } = body || {}
  const fx = adminFixtures()
  const kindOf = (u) => (u._paid ? 'regular' : u._manual ? 'manual' : null)
  if (action === 'dashboard') {
    return {
      ok: true,
      totals: { totalUsers: fx.users.length, subscribers: fx.users.filter((u) => u._paid || u._manual).length, active7d: 7, openFeedback: fx.feedback.filter((f) => f.status !== 'done').length, sessionsThisWeek: 23 },
      signups: Array.from({ length: 12 }, (_, i) => ({ weekStart: dayISO(-(11 - i) * 7), count: Math.round(2 + Math.abs(Math.sin(i)) * 5) })),
    }
  }
  if (action === 'users') {
    return { ok: true, rows: fx.users.map((u) => ({ ...u, subscriber_kind: kindOf(u), is_subscriber: !!kindOf(u) })) }
  }
  if (action === 'set_subscriber') {
    const u = fx.users.find((x) => x.id === body.user_id)
    if (u) u._manual = !!body.value
    return { ok: true, is_subscriber: u ? !!kindOf(u) : false }
  }
  if (action === 'delete_user') {
    const idx = fx.users.findIndex((x) => x.id === body.user_id)
    if (idx >= 0) fx.users.splice(idx, 1)
    return { ok: true }
  }
  if (action === 'feedback_list') return { ok: true, items: fx.feedback }
  if (action === 'feedback_update_status') {
    const row = fx.feedback.find((f) => f.id === body.id)
    if (row) row.status = body.status
    return { ok: true }
  }
  if (action === 'analytics') {
    const span = body.range === 'week' ? 7 : body.range === 'all' ? 60 : 30
    return {
      ok: true,
      range: body.range,
      totalUsers: fx.users.length,
      sessionsOverTime: fx.buckets(span, 8),
      reflectionsOverTime: fx.buckets(span, 5),
      funnel: STEP_LABELS.map((label, i) => ({ step: String(i), label, count: Math.max(1, fx.users.length - i) })),
      topUsers: fx.users.slice(0, 10).map((u) => ({ email: u.email, sessions: u.sessions })),
    }
  }
  return { ok: true }
}

export function makeMockClient() {
  return {
    from: (table) => makeQuery(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
    functions: {
      invoke: async (name, opts) => {
        // The admin console talks to one function; synthesise its data so the
        // /admin screens render in preview. Everything else is a no-op ok.
        if (name === 'admin') return { data: adminInvoke(opts?.body), error: null }
        // Google Calendar in preview: "connected" so the synced-events
        // accordion renders against the mock calendar_events fixtures.
        if (name === 'google-calendar') return { data: { status: { connected: true, sync_from: '2025-06-07', last_synced_at: new Date().toISOString() } }, error: null }
        return { data: { ok: true }, error: null }
      },
    },
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
