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
import { PRIVACY_VERSION, DPA_VERSION, TERMS_VERSION } from './legal'

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
    /* Consent versions track legal.js so the policy-update gate doesn't block
       the mocked-in app whenever a *_VERSION bumps (was hard-coded '1.0'). */
    user_metadata: { full_name: 'מאמן/ת לדוגמה', privacy_version: PRIVACY_VERSION, dpa_version: DPA_VERSION, terms_version: TERMS_VERSION, marketing_consent: true },
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
    // Preview seed: user 2 is already a promoted admin (so the "מנהל" chip +
    // the update/revoke flow render). Others start as non-admins.
    _admin: i === 2,
    _adminPerms: i === 2
      ? { delete_users: true, set_subscriber: true, manage_admins: false }
      : { delete_users: false, set_subscriber: false, manage_admins: false },
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
    return {
      ok: true,
      rows: fx.users.map((u) => ({
        ...u,
        subscriber_kind: kindOf(u),
        is_subscriber: !!kindOf(u),
        is_owner: false, // none of the example users is the hardcoded owner
        is_admin: !!u._admin,
        admin_perms: u._adminPerms || { delete_users: false, set_subscriber: false, manage_admins: false },
      })),
      // The mocked viewer is the owner → every power.
      caller: { is_owner: true, perms: { delete_users: true, set_subscriber: true, manage_admins: true } },
    }
  }
  if (action === 'set_subscriber') {
    const u = fx.users.find((x) => x.id === body.user_id)
    if (u) u._manual = !!body.value
    return { ok: true, is_subscriber: u ? !!kindOf(u) : false }
  }
  if (action === 'set_admin') {
    const u = fx.users.find((x) => x.id === body.user_id)
    if (u) {
      u._admin = true
      u._adminPerms = {
        delete_users: !!body.perms?.delete_users,
        set_subscriber: !!body.perms?.set_subscriber,
        manage_admins: !!body.perms?.manage_admins,
      }
    }
    return { ok: true, role: 'admin', admin_perms: u?._adminPerms }
  }
  if (action === 'revoke_admin') {
    const u = fx.users.find((x) => x.id === body.user_id)
    if (u) { u._admin = false; u._adminPerms = { delete_users: false, set_subscriber: false, manage_admins: false } }
    return { ok: true }
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
        // Invoices in preview: a "connected" SUMIT account so the connections
        // card AND the "הפק חשבונית" action on transactions render end-to-end.
        if (name === 'invoices') {
          const a = opts?.body?.action
          if (a === 'issue') return { data: { ok: true, document: { number: '2026-1042', url: 'https://example.com/doc.pdf', type: opts?.body?.doc_type } }, error: null }
          if (a === 'credit') return { data: { ok: true, document: { number: '2026-2001', url: 'https://example.com/credit.pdf' } }, error: null }
          if (a === 'disconnect') return { data: { ok: true, status: { connected: false } }, error: null }
          if (a === 'connect') return { data: { status: { connected: true, provider: opts?.body?.provider, environment: opts?.body?.environment, connected_at: new Date().toISOString(), auto_import: true, webhook_url: opts?.body?.provider === 'sumit' ? 'https://rdurkakzyymxhocvhufw.supabase.co/functions/v1/invoice-webhook?t=mock-token' : null } }, error: null }
          if (a === 'import-approve') return { data: { ok: true, transaction_id: 'mock-tx' }, error: null }
          if (a === 'import-dismiss') return { data: { ok: true }, error: null }
          if (a === 'catalog') return { data: { items: [{ id: '1', name: 'אימון אישי', price: 380 }, { id: '2', name: 'ייעוץ זוגי', price: 450 }] }, error: null }
          return { data: { status: { connected: true, provider: 'sumit', environment: 'production', connected_at: new Date().toISOString(), auto_import: true, webhook_url: 'https://rdurkakzyymxhocvhufw.supabase.co/functions/v1/invoice-webhook?t=mock-token' }, ok: true }, error: null }
        }
        // Inline booking block in preview: serve a booking page config + sample
        // future slots (GET) and accept a booking (POST) so the picker works.
        if (name.startsWith('booking-intake')) {
          const q = new URLSearchParams(name.split('?')[1] || '')
          const method = opts?.method || 'POST'
          const pages = MOCK_DB.booking_pages || []
          const match = (key) => pages.find((p) => p.published && (p.id === key || p.slug === key))
          if (method === 'GET' && q.get('action') === 'slots') {
            const slots = []
            const base = new Date(); base.setHours(0, 0, 0, 0)
            for (let d = 1; d <= 3; d++) for (const h of [9, 10.5, 12]) {
              const s = new Date(base); s.setDate(s.getDate() + d); s.setHours(Math.floor(h), (h % 1) * 60, 0, 0)
              slots.push({ start: s.toISOString(), end: new Date(s.getTime() + 45 * 60000).toISOString() })
            }
            return { data: { slots, timezone: 'Asia/Jerusalem' }, error: null }
          }
          if (method === 'GET') {
            const page = match(q.get('page'))
            if (!page) return { data: null, error: { message: 'not_found' } }
            return { data: { id: page.id, content: page.content, meetingTypes: [
              { id: 't1', name: 'פגישת אונליין', duration_minutes: 45, default_price: 0 },
              { id: 't2', name: 'פגישה פיזית', duration_minutes: 60, default_price: 250 },
            ], availability: { timezone: 'Asia/Jerusalem', maxDaysAhead: 14 } }, error: null }
          }
          const page = match(opts?.body?.page)
          return { data: { ok: true, thankYou: page?.content?.thankYou ?? { message: 'נתראה!' } }, error: null }
        }
        // Public builder pages in preview: serve the mock site_pages config (GET)
        // and accept a form submission (POST) so /p/<id> renders end-to-end.
        if (name.startsWith('site-intake')) {
          const pages = MOCK_DB.site_pages || []
          const match = (key, kind) => pages.find((p) => p.published && (p.id === key || p.slug === key) && (!kind || p.kind === kind))
          if ((opts?.method || 'POST') === 'GET') {
            const q = new URLSearchParams(name.split('?')[1] || '')
            const page = match(q.get('page'), q.get('kind'))
            if (!page) return { data: null, error: { message: 'not_found' } }
            const v = page.published_snapshot || { theme: page.theme, sections: page.sections, config: page.config }
            return { data: { id: page.id, kind: page.kind, theme: v.theme, sections: v.sections, config: { thankYou: v.config?.thankYou ?? null, seo: v.config?.seo ?? null } }, error: null }
          }
          const page = match(opts?.body?.page, opts?.body?.kind)
          const pv = page && (page.published_snapshot || { sections: page.sections, config: page.config })
          const section = (pv?.sections || []).find((s) => s.type === 'form')
          return { data: { ok: true, thankYou: section?.props?.thankYou ?? pv?.config?.thankYou ?? null }, error: null }
        }
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
