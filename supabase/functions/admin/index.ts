// ════════════════════════════════════════════════════════════════
//  admin — stats/management console backend for the owner + admins.
// ════════════════════════════════════════════════════════════════
//  The /admin screens in the React app are gated client-side, but a
//  client gate is cosmetic. This function is the REAL gate: every
//  request must carry an admin's JWT, and we verify server-side that
//  the caller is either the hardcoded super-owner (ADMIN_EMAIL) OR a
//  user the owner promoted (app_metadata.role === 'admin') before
//  touching any data. Anyone else gets 403. Sensitive actions are
//  further gated per-permission (see `perms` below).
//
//  WHY app_metadata for the admin flag:
//   app_metadata is writable ONLY with the service_role key (i.e. only
//   here, server-side) — never from the browser, unlike user_metadata
//   or user_preferences. So it's the one place a user can't tamper with
//   to escalate their own privileges. It also travels inside the JWT,
//   so the client gate can read it with no extra fetch.
//
//  WHY an edge function at all:
//   Every public table has RLS scoped to `user_id = auth.uid()`, so a
//   browser query only ever returns the caller's own rows — it can't
//   see other users. And emails live in auth.users, unreadable from the
//   browser entirely. To aggregate across ALL users we must run with the
//   service_role key, which only exists server-side. The app's RLS is
//   left completely untouched — this is a separate, additive world.
//
//  Actions (POST body { action, ...params }):
//   - dashboard               → headline counters + weekly signups
//   - users                   → one row per registered user (+ admin flags)
//   - feedback_list           → every feedback item + author email
//   - feedback_update_status  → { id, status }
//   - analytics               → { range } sessions/reflections/funnel/top
//   - set_subscriber          → { user_id, value }   (perm: set_subscriber)
//   - delete_user             → { user_id }           (perm: delete_users)
//   - set_admin               → { user_id, perms }    (perm: manage_admins)
//   - revoke_admin            → { user_id }           (perm: manage_admins)
//
//  Deploy:   supabase functions deploy admin
//  Secrets:  none needed — SUPABASE_URL / SUPABASE_ANON_KEY /
//            SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ADMIN_EMAIL = 'simplicity.os.app@gmail.com'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Published monthly prices (ILS) per paid tier — mirrors PRICES in
// src/lib/subscription.js. Captured into locked_price at subscription time so
// existing subscribers keep their terms if these change later.
const TIER_PRICES: Record<string, number> = { basic: 42, premium: 89 }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const DAY = 86_400_000
const dayKey = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD

/* The 9-step onboarding flow (mirrors src/lib/preferences.js). Kept in
   sync by hand — if a step is added there, add it here too. */
const ONBOARDING_STEPS = [
  'profile', 'data_import', 'projects', 'clients', 'daily_questions',
  'goals', 'recurring', 'preview', 'finish',
]
const STEP_LABELS: Record<string, string> = {
  profile: 'פרופיל',
  data_import: 'ייבוא נתונים',
  projects: 'פרויקטים',
  clients: 'לקוחות',
  daily_questions: 'שאלות יומיות',
  goals: 'יעדים',
  recurring: 'הוראות קבע',
  preview: 'תצוגה מקדימה',
  finish: 'סיום',
}

type AdminPerms = { delete_users: boolean; set_subscriber: boolean; manage_admins: boolean }
type AuthUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; marketing_consent: boolean; is_admin: boolean; admin_perms: AdminPerms }

/* Page through auth.users with the admin API (max 1000/page) so no user
   is missed once the beta grows past a single page. */
async function fetchAllUsers(admin: ReturnType<typeof createClient>): Promise<AuthUser[]> {
  const out: AuthUser[] = []
  let page = 1
  // Hard stop at 100 pages (100k users) — far past beta, just a guard.
  while (page <= 100) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const batch = data?.users ?? []
    for (const u of batch) {
      const ap = (u.app_metadata?.admin_perms ?? {}) as Record<string, unknown>
      out.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        marketing_consent: u.user_metadata?.marketing_consent === true,
        is_admin: u.app_metadata?.role === 'admin',
        admin_perms: {
          delete_users:   ap.delete_users === true,
          set_subscriber: ap.set_subscriber === true,
          manage_admins:  ap.manage_admins === true,
        },
      })
    }
    if (batch.length < 1000) break
    page += 1
  }
  return out
}

/* Furthest onboarding step a user reached, as an index into
   ONBOARDING_STEPS. completed/skipped → past the last step (9). */
function onboardingProgress(ob: any): { index: number; label: string; done: boolean } {
  if (!ob || typeof ob !== 'object') {
    return { index: 0, label: STEP_LABELS.profile, done: false }
  }
  if (ob.completed_at) return { index: ONBOARDING_STEPS.length, label: 'הושלם', done: true }
  if (ob.skipped_at) return { index: ONBOARDING_STEPS.length, label: 'דילג', done: true }
  const idx = Math.max(0, ONBOARDING_STEPS.indexOf(ob.step || 'profile'))
  return { index: idx, label: STEP_LABELS[ONBOARDING_STEPS[idx]] ?? 'פרופיל', done: false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // ── 1. Authenticate + authorise the caller (the real gate) ──────
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await caller.auth.getUser()
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)
    // A CONFIRMED email is required either way — stays correct even if
    // email-confirmation is ever relaxed, or email-change semantics issue a
    // session on an unconfirmed address.
    if (!user.email_confirmed_at) return json({ error: 'forbidden' }, 403)
    // Admin = the hardcoded super-owner OR a user the owner promoted
    // (app_metadata.role === 'admin', set only by set_admin below).
    const isOwner = (user.email ?? '').toLowerCase() === ADMIN_EMAIL
    const meta = (user.app_metadata ?? {}) as Record<string, unknown>
    const isPromoted = meta.role === 'admin'
    if (!isOwner && !isPromoted) return json({ error: 'forbidden' }, 403)
    // Effective permissions. The owner implicitly has every power; a promoted
    // admin has exactly the perms stamped on their metadata (default false).
    // These gate the sensitive actions below; read actions need only admin.
    const mp = (meta.admin_perms ?? {}) as Record<string, unknown>
    const perms = {
      delete_users:   isOwner || mp.delete_users === true,
      set_subscriber: isOwner || mp.set_subscriber === true,
      manage_admins:  isOwner || mp.manage_admins === true,
    }

    // ── 2. Service-role client — bypasses RLS, owner-verified above ──
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json().catch(() => ({}))
    const action = body?.action as string

    // ── 3. Route ────────────────────────────────────────────────────
    if (action === 'feedback_update_status') {
      const id = body?.id as string
      const status = body?.status as string
      // Notion-parity status set (migration 0079): new/in_progress/waiting_decision/done/rejected.
      if (!id || !['new', 'in_progress', 'waiting_decision', 'done', 'rejected'].includes(status)) {
        return json({ error: 'bad request' }, 400)
      }
      const { error } = await admin.from('feedback').update({ status }).eq('id', id)
      if (error) return json({ error: 'update failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    // Full triage patch for the backlog board (migration 0079). Updates only the
    // fields present in the body, each validated against its enum. This is the
    // Notion-replacement write path — status + classification + surface +
    // platform + title + notes.
    if (action === 'feedback_update') {
      const id = body?.id as string
      if (!id || !UUID_RE.test(id)) return json({ error: 'bad request' }, 400)
      const ENUMS: Record<string, string[]> = {
        status: ['new', 'in_progress', 'waiting_decision', 'done', 'rejected'],
        classification: ['bug', 'dev', 'unclear'],
        surface: ['technical', 'design', 'both'],
        platform: ['mobile', 'desktop', 'both', 'unknown'],
      }
      const patch: Record<string, unknown> = {}
      for (const field of Object.keys(ENUMS)) {
        if (!(field in body)) continue
        const v = body[field]
        if (field === 'status') {
          if (!ENUMS.status.includes(v)) return json({ error: 'bad status' }, 400)
          patch.status = v
        } else {
          // classification/surface/platform are nullable — '' or null clears them.
          if (v !== null && v !== '' && !ENUMS[field].includes(v)) return json({ error: `bad ${field}` }, 400)
          patch[field] = v === '' ? null : v
        }
      }
      if ('title' in body) patch.title = body.title == null ? null : String(body.title).slice(0, 200)
      if ('notes' in body) patch.notes = body.notes == null ? null : String(body.notes).slice(0, 8000)
      if (Object.keys(patch).length === 0) return json({ error: 'nothing to update' }, 400)
      const { error } = await admin.from('feedback').update(patch).eq('id', id)
      if (error) return json({ error: 'update failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    // Manually mark/unmark a user as a subscriber — even without a real
    // payment (beta). Stored as preferences.subscription.manual on the
    // TARGET user's own row (merged, never overwriting their prefs). The
    // app ignores this key, so a flagged user's experience is unchanged.
    // Writable only here (service-role) since RLS scopes prefs per-user.
    if (action === 'set_subscriber') {
      if (!perms.set_subscriber) return json({ error: 'forbidden' }, 403)
      const uid = body?.user_id as string
      const value = !!body?.value
      if (!uid || !UUID_RE.test(uid)) return json({ error: 'bad request' }, 400)
      const { data: rows, error: readErr } = await admin
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', uid)
        .limit(1)
      if (readErr) return json({ error: 'read failed', detail: readErr.message }, 500)
      const existing = (rows?.[0]?.preferences && typeof rows[0].preferences === 'object') ? rows[0].preferences : {}
      const nextPrefs = { ...existing, subscription: { ...(existing.subscription || {}), manual: value, set_at: new Date().toISOString() } }
      const { error: upErr } = await admin
        .from('user_preferences')
        .upsert({ user_id: uid, preferences: nextPrefs }, { onConflict: 'user_id' })
      if (upErr) return json({ error: 'write failed', detail: upErr.message }, 500)
      return json({ ok: true, is_subscriber: value })
    }

    // Set a user's subscription TIER and/or BETA EXEMPTION — the new billing
    // model. Writes the user_subscriptions table (the source of truth that
    // current_tier() reads for RLS), service-role only. Reads-then-merges so a
    // tier-only or beta-only update never clobbers the other fields (e.g. a
    // future Stripe customer id). perm: set_subscriber.
    if (action === 'set_subscription') {
      if (!perms.set_subscriber) return json({ error: 'forbidden' }, 403)
      const uid = body?.user_id as string
      if (!uid || !UUID_RE.test(uid)) return json({ error: 'bad request' }, 400)
      const patch: Record<string, unknown> = {}
      if (body?.tier !== undefined) {
        if (!['free', 'basic', 'premium'].includes(body.tier)) return json({ error: 'bad tier' }, 400)
        patch.tier = body.tier
      }
      if (body?.beta_exempt_until !== undefined) {
        const v = body.beta_exempt_until
        if (v === null || v === '') {
          patch.beta_exempt_until = null
        } else {
          const d = new Date(v as string)
          if (isNaN(d.getTime())) return json({ error: 'bad date' }, 400)
          patch.beta_exempt_until = d.toISOString()
        }
      }
      if (!Object.keys(patch).length) return json({ error: 'nothing to update' }, 400)
      const { data: rows, error: readErr } = await admin
        .from('user_subscriptions').select('*').eq('user_id', uid).limit(1)
      if (readErr) return json({ error: 'read failed', detail: readErr.message }, 500)
      const existing = (rows?.[0] ?? { user_id: uid, tier: 'free' }) as Record<string, unknown>
      // Price grandfathering: when the tier CHANGES, snapshot the terms.
      //   → a (different) paid tier: stamp subscribed_at + lock the current price.
      //   → free: clear the locked terms (no active paid subscription).
      //   → same paid tier re-set: leave the original terms intact.
      if (patch.tier !== undefined) {
        const prevTier = (existing.tier as string) ?? 'free'
        if (patch.tier === 'free') {
          patch.subscribed_at = null
          patch.locked_price = null
        } else if (patch.tier !== prevTier) {
          patch.subscribed_at = new Date().toISOString()
          patch.locked_price = TIER_PRICES[patch.tier as string] ?? null
        }
      }
      const next: Record<string, unknown> = { ...existing, ...patch, user_id: uid }
      delete next.created_at
      delete next.updated_at
      const { error: upErr } = await admin
        .from('user_subscriptions').upsert(next, { onConflict: 'user_id' })
      if (upErr) return json({ error: 'write failed', detail: upErr.message }, 500)
      return json({ ok: true, tier: next.tier ?? 'free', beta_exempt_until: next.beta_exempt_until ?? null, subscribed_at: next.subscribed_at ?? null, locked_price: next.locked_price ?? null })
    }

    // Permanently delete a user — removes the auth.users row, which cascades
    // to all their app data via ON DELETE CASCADE. Owner-only (verified at the
    // top); deleting the owner's own account is blocked. Destructive +
    // irreversible — the client gates this behind a typed-email confirmation.
    if (action === 'delete_user') {
      if (!perms.delete_users) return json({ error: 'forbidden' }, 403)
      const uid = body?.user_id as string
      if (!uid || !UUID_RE.test(uid)) return json({ error: 'bad request' }, 400)
      if (uid === user.id) return json({ error: 'cannot delete the owner account' }, 400)
      const { error } = await admin.auth.admin.deleteUser(uid)
      if (error) return json({ error: 'delete failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    // Promote a user to admin, or update an existing admin's permissions.
    // Stored in the TARGET's app_metadata.{role,admin_perms} — writable only
    // here (service-role), so it can't be self-set from the browser. Requires
    // the `manage_admins` perm. Guards against self-edit (no self-escalation /
    // self-lockout) and against touching the super-owner (always all-powerful).
    // GoTrue shallow-merges app_metadata, so we pass only the two keys and
    // leave provider info intact. The promoted user gains console access on
    // their NEXT token refresh / sign-in (the new role rides in the JWT).
    if (action === 'set_admin') {
      if (!perms.manage_admins) return json({ error: 'forbidden' }, 403)
      const uid = body?.user_id as string
      if (!uid || !UUID_RE.test(uid)) return json({ error: 'bad request' }, 400)
      if (uid === user.id) return json({ error: 'cannot change your own admin status' }, 400)
      const { data: target, error: tErr } = await admin.auth.admin.getUserById(uid)
      if (tErr || !target?.user) return json({ error: 'user not found' }, 404)
      if ((target.user.email ?? '').toLowerCase() === ADMIN_EMAIL) {
        return json({ error: 'cannot modify the owner account' }, 400)
      }
      const p = (body?.perms ?? {}) as Record<string, unknown>
      const admin_perms = {
        delete_users:   p.delete_users === true,
        set_subscriber: p.set_subscriber === true,
        manage_admins:  p.manage_admins === true,
      }
      const { error } = await admin.auth.admin.updateUserById(uid, {
        app_metadata: { role: 'admin', admin_perms },
      })
      if (error) return json({ error: 'update failed', detail: error.message }, 500)
      return json({ ok: true, role: 'admin', admin_perms })
    }

    // Revoke a user's admin status — null out role + admin_perms in their
    // app_metadata. Same guards as set_admin. Takes effect on the demoted
    // user's next token refresh / sign-in.
    if (action === 'revoke_admin') {
      if (!perms.manage_admins) return json({ error: 'forbidden' }, 403)
      const uid = body?.user_id as string
      if (!uid || !UUID_RE.test(uid)) return json({ error: 'bad request' }, 400)
      if (uid === user.id) return json({ error: 'cannot change your own admin status' }, 400)
      const { data: target, error: tErr } = await admin.auth.admin.getUserById(uid)
      if (tErr || !target?.user) return json({ error: 'user not found' }, 404)
      if ((target.user.email ?? '').toLowerCase() === ADMIN_EMAIL) {
        return json({ error: 'cannot modify the owner account' }, 400)
      }
      const { error } = await admin.auth.admin.updateUserById(uid, {
        app_metadata: { role: null, admin_perms: null },
      })
      if (error) return json({ error: 'update failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'feedback_list') {
      const users = await fetchAllUsers(admin)
      const emailById = new Map(users.map((u) => [u.id, u.email]))
      const FULL = 'id, user_id, message, type, status, created_at, platform, source, classification, surface, title, notes'
      const BASE = 'id, user_id, message, type, status, created_at'
      let { data: rows, error } = await admin
        .from('feedback').select(FULL).order('created_at', { ascending: false })
      // Deploy-order resilience: if this edge ships before migration 0079 adds
      // the triage columns, PostgREST errors on the unknown columns — fall back
      // to the base select so the board still loads (triage fields just empty).
      if (error && /column|does not exist|schema cache|find/i.test(error.message || '')) {
        ;({ data: rows, error } = await admin
          .from('feedback').select(BASE).order('created_at', { ascending: false }))
      }
      if (error) return json({ error: 'query failed', detail: error.message }, 500)
      const items = (rows ?? []).map((r) => ({
        id: r.id,
        email: emailById.get(r.user_id) ?? null,
        message: r.message,
        type: r.type ?? null,
        status: r.status ?? 'new',
        created_at: r.created_at,
        // Triage fields (migration 0079) — the backlog board reads/edits these.
        platform: r.platform ?? null,
        source: r.source ?? 'app',
        classification: r.classification ?? null,
        surface: r.surface ?? null,
        title: r.title ?? null,
        notes: r.notes ?? null,
      }))
      return json({ ok: true, items })
    }

    if (action === 'dashboard') {
      const users = await fetchAllUsers(admin)
      const nowMs = Date.now()
      const weekAgo = nowMs - 7 * DAY

      const active7d = users.filter(
        (u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= weekAgo,
      ).length

      const { data: fb } = await admin.from('feedback').select('status')
      const openFeedback = (fb ?? []).filter((r) => r.status !== 'done').length

      // "sessions" here = app-usage opens (app_sessions, migration 0076), NOT
      // coaching sessions. Empty until the migration runs / sessions accrue.
      const { data: sess } = await admin
        .from('app_sessions')
        .select('created_at')
      const sessionsThisWeek = (sess ?? []).filter(
        (s) => new Date(s.created_at).getTime() >= weekAgo,
      ).length

      // Manually-flagged subscribers (preferences.subscription.manual).
      const { data: subPrefs } = await admin
        .from('user_preferences')
        .select('preferences')
      const subscribers = (subPrefs ?? []).filter((p) => {
        const s = p?.preferences?.subscription
        return s?.manual === true || s?.paid === true
      }).length

      // Weekly signup buckets — last 12 weeks, oldest → newest.
      const WEEKS = 12
      const signups: { weekStart: string; count: number }[] = []
      for (let i = WEEKS - 1; i >= 0; i--) {
        const start = nowMs - (i + 1) * 7 * DAY
        const end = nowMs - i * 7 * DAY
        const count = users.filter((u) => {
          const t = new Date(u.created_at).getTime()
          return t >= start && t < end
        }).length
        signups.push({ weekStart: dayKey(new Date(end - 7 * DAY)), count })
      }

      return json({
        ok: true,
        totals: {
          totalUsers: users.length,
          subscribers, // manually flagged (no real billing infra yet)
          active7d,
          openFeedback,
          sessionsThisWeek,
        },
        signups,
      })
    }

    if (action === 'users') {
      const users = await fetchAllUsers(admin)

      const [{ data: moon }, { data: sess }, { data: prefs }, { data: fb }, { data: consent }, { data: subs }] = await Promise.all([
        admin.from('moon_snapshots').select('user_id, reflection'),
        admin.from('app_sessions').select('user_id'),
        admin.from('user_preferences').select('user_id, preferences'),
        admin.from('feedback').select('user_id'),
        admin.from('user_consent').select('user_id, kind, version, accepted, accepted_at, created_at'),
        // New billing model: tier + beta exemption + locked terms (migration 0075).
        admin.from('user_subscriptions').select('user_id, tier, beta_exempt_until, subscribed_at, locked_price'),
      ])

      const subById = new Map<string, { tier: string; beta_exempt_until: string | null; subscribed_at: string | null; locked_price: number | null }>()
      for (const s of subs ?? []) subById.set(s.user_id, { tier: s.tier ?? 'free', beta_exempt_until: s.beta_exempt_until ?? null, subscribed_at: s.subscribed_at ?? null, locked_price: s.locked_price ?? null })

      const reflById = new Map<string, number>()
      for (const r of moon ?? []) {
        const txt = (r.reflection ?? '').toString().trim()
        if (txt) reflById.set(r.user_id, (reflById.get(r.user_id) ?? 0) + 1)
      }
      const sessById = new Map<string, number>()
      for (const s of sess ?? []) {
        sessById.set(s.user_id, (sessById.get(s.user_id) ?? 0) + 1)
      }
      const obById = new Map<string, any>()
      // Subscriber "kind": real billing (subscription.paid) → 'regular';
      // owner-flagged (subscription.manual) → 'manual'; neither → null.
      // paid wins so a manually-flagged paying user still counts as regular.
      const kindById = new Map<string, 'manual' | 'regular' | null>()
      for (const p of prefs ?? []) {
        obById.set(p.user_id, p.preferences?.onboarding)
        const sub = p.preferences?.subscription
        const kind = sub?.paid === true ? 'regular' : sub?.manual === true ? 'manual' : null
        kindById.set(p.user_id, kind)
      }
      const fbById = new Map<string, number>()
      for (const f of fb ?? []) fbById.set(f.user_id, (fbById.get(f.user_id) ?? 0) + 1)

      // Latest acceptance per kind, per user — the current legal-consent state.
      // user_consent is append-only (re-acceptances add rows). Rank by the
      // SERVER-stamped created_at (recorded_at) — tamper-proof per migration 0032
      // — NOT the client-supplied accepted_at, which can be backdated. recorded_at
      // is the timestamp to trust/display in a dispute. Shape: { privacy|dpa|terms|marketing: {...} }.
      const consentById = new Map<string, Record<string, { version: string | null; accepted: boolean; accepted_at: string; recorded_at: string }>>()
      for (const c of consent ?? []) {
        let m = consentById.get(c.user_id)
        if (!m) { m = {}; consentById.set(c.user_id, m) }
        const prev = m[c.kind]
        const recAt = (c.created_at as string) ?? c.accepted_at
        if (!prev || new Date(recAt).getTime() > new Date(prev.recorded_at).getTime()) {
          m[c.kind] = { version: c.version ?? null, accepted: !!c.accepted, accepted_at: c.accepted_at, recorded_at: recAt }
        }
      }

      const rows = users
        .map((u) => {
          const ob = onboardingProgress(obById.get(u.id))
          return {
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            onboarding_index: ob.index,
            onboarding_label: ob.label,
            onboarding_done: ob.done,
            reflections: reflById.get(u.id) ?? 0,
            sessions: sessById.get(u.id) ?? 0,
            feedback_count: fbById.get(u.id) ?? 0,
            subscriber_kind: kindById.get(u.id) ?? null,
            is_subscriber: !!kindById.get(u.id),
            subscription_tier: subById.get(u.id)?.tier ?? 'free',
            beta_exempt_until: subById.get(u.id)?.beta_exempt_until ?? null,
            subscribed_at: subById.get(u.id)?.subscribed_at ?? null,
            locked_price: subById.get(u.id)?.locked_price ?? null,
            marketing_consent: u.marketing_consent,
            consent: consentById.get(u.id) ?? {},
            is_owner: (u.email ?? '').toLowerCase() === ADMIN_EMAIL,
            is_admin: u.is_admin,
            admin_perms: u.admin_perms,
          }
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      // The caller's own effective powers — lets the console show exactly the
      // controls this admin is allowed to use, without re-deriving from the JWT.
      return json({ ok: true, rows, caller: { is_owner: isOwner, perms } })
    }

    if (action === 'analytics') {
      const range = (body?.range as string) || 'month'
      const nowMs = Date.now()
      const spanDays = range === 'week' ? 7 : range === 'all' ? 365 : 30
      const startMs = nowMs - spanDays * DAY

      const users = await fetchAllUsers(admin)
      const emailById = new Map(users.map((u) => [u.id, u.email]))

      const [{ data: sess }, { data: moon }, { data: prefs }, { data: landing }] = await Promise.all([
        admin.from('app_sessions').select('user_id, created_at'),
        admin.from('moon_snapshots').select('reflection, date, created_at'),
        admin.from('user_preferences').select('user_id, preferences'),
        // Anonymous landing funnel events (null if migration 0050 hasn't run yet).
        admin.from('landing_events').select('type, created_at'),
      ])

      // Empty daily buckets across the span, oldest → newest.
      const makeBuckets = () => {
        const b: { date: string; count: number }[] = []
        const startDay = new Date(startMs)
        startDay.setHours(0, 0, 0, 0)
        for (let t = startDay.getTime(); t <= nowMs; t += DAY) {
          b.push({ date: dayKey(new Date(t)), count: 0 })
        }
        return b
      }
      const bump = (buckets: { date: string; count: number }[], key: string) => {
        const hit = buckets.find((x) => x.date === key)
        if (hit) hit.count += 1
      }

      const sessionsOverTime = makeBuckets()
      const topMap = new Map<string, number>()
      for (const s of sess ?? []) {
        const t = new Date(s.created_at).getTime()
        if (t >= startMs) {
          bump(sessionsOverTime, dayKey(new Date(s.created_at)))
          topMap.set(s.user_id, (topMap.get(s.user_id) ?? 0) + 1)
        }
      }

      const reflectionsOverTime = makeBuckets()
      for (const m of moon ?? []) {
        const txt = (m.reflection ?? '').toString().trim()
        if (!txt) continue
        const key = (m.date as string) || dayKey(new Date(m.created_at))
        if (new Date(key).getTime() >= startMs) bump(reflectionsOverTime, key)
      }

      // Onboarding funnel — how many reached each step, out of all users.
      // Resolve each user's furthest step once, then bucket by index.
      const obIndexById = new Map<string, number>()
      for (const p of prefs ?? []) {
        obIndexById.set(p.user_id, onboardingProgress(p.preferences?.onboarding).index)
      }
      const reachedIdx = users.map((u) => obIndexById.get(u.id) ?? 0)
      const funnel = ONBOARDING_STEPS.map((step, i) => ({
        step,
        label: STEP_LABELS[step],
        count: reachedIdx.filter((idx) => idx >= i).length,
      }))

      const topUsers = [...topMap.entries()]
        .map(([uid, count]) => ({ email: emailById.get(uid) ?? null, sessions: count }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 10)

      // Marketing landing — anonymous events bucketed by type within range.
      const lpCounts: Record<string, number> = {}
      for (const e of landing ?? []) {
        if (new Date(e.created_at).getTime() < startMs) continue
        lpCounts[e.type] = (lpCounts[e.type] ?? 0) + 1
      }
      const lpSignups = users.filter((u) => u.created_at && new Date(u.created_at).getTime() >= startMs).length
      // Funnel: view → signup_start → completed signup (drop-off = starts − signups).
      const landingFunnel = [
        { label: 'כניסות לדף', count: lpCounts['view'] ?? 0 },
        { label: 'התחילו הרשמה', count: lpCounts['signup_start'] ?? 0 },
        { label: 'השלימו הרשמה', count: lpSignups },
      ]
      // Engagement: how deep visitors went (scroll), whether they opened the
      // FAQ, and whether they stayed to read (~30s).
      const landingEngagement = [
        { label: 'גללו לאמצע', count: lpCounts['scroll_50'] ?? 0 },
        { label: 'גללו לרובו', count: lpCounts['scroll_75'] ?? 0 },
        { label: 'הגיעו לתחתית', count: lpCounts['scroll_100'] ?? 0 },
        { label: 'פתחו שאלות נפוצות', count: lpCounts['faq_open'] ?? 0 },
        { label: 'קראו לעומק (30ש+)', count: lpCounts['engaged'] ?? 0 },
      ]

      return json({
        ok: true,
        range,
        totalUsers: users.length,
        sessionsOverTime,
        reflectionsOverTime,
        funnel,
        landingFunnel,
        landingEngagement,
        topUsers,
      })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
