// ════════════════════════════════════════════════════════════════
//  admin — read-only stats console backend for the single owner.
// ════════════════════════════════════════════════════════════════
//  The /admin screens in the React app are gated client-side to the
//  owner's email, but a client gate is cosmetic. This function is the
//  REAL gate: every request must carry the owner's JWT, and we verify
//  server-side that the caller's email is exactly ADMIN_EMAIL before
//  touching any data. Anyone else gets 403.
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
//   - users                   → one row per registered user
//   - feedback_list           → every feedback item + author email
//   - feedback_update_status  → { id, status } (the ONLY write)
//   - analytics               → { range } sessions/reflections/funnel/top
//
//  Deploy:   supabase functions deploy admin
//  Secrets:  none needed — SUPABASE_URL / SUPABASE_ANON_KEY /
//            SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ADMIN_EMAIL = 'simplicity.os.app@gmail.com'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

type AuthUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; marketing_consent: boolean }

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
      out.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        marketing_consent: u.user_metadata?.marketing_consent === true,
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
    // Require a CONFIRMED owner email — stays correct even if email-confirmation
    // is ever relaxed, or email-change semantics issue a session on an
    // unconfirmed address that happens to equal ADMIN_EMAIL.
    if (!user.email_confirmed_at || (user.email ?? '').toLowerCase() !== ADMIN_EMAIL) {
      return json({ error: 'forbidden' }, 403)
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
      if (!id || !['new', 'in_progress', 'done'].includes(status)) {
        return json({ error: 'bad request' }, 400)
      }
      const { error } = await admin.from('feedback').update({ status }).eq('id', id)
      if (error) return json({ error: 'update failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    // Manually mark/unmark a user as a subscriber — even without a real
    // payment (beta). Stored as preferences.subscription.manual on the
    // TARGET user's own row (merged, never overwriting their prefs). The
    // app ignores this key, so a flagged user's experience is unchanged.
    // Writable only here (service-role) since RLS scopes prefs per-user.
    if (action === 'set_subscriber') {
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

    // Permanently delete a user — removes the auth.users row, which cascades
    // to all their app data via ON DELETE CASCADE. Owner-only (verified at the
    // top); deleting the owner's own account is blocked. Destructive +
    // irreversible — the client gates this behind a typed-email confirmation.
    if (action === 'delete_user') {
      const uid = body?.user_id as string
      if (!uid || !UUID_RE.test(uid)) return json({ error: 'bad request' }, 400)
      if (uid === user.id) return json({ error: 'cannot delete the owner account' }, 400)
      const { error } = await admin.auth.admin.deleteUser(uid)
      if (error) return json({ error: 'delete failed', detail: error.message }, 500)
      return json({ ok: true })
    }

    if (action === 'feedback_list') {
      const users = await fetchAllUsers(admin)
      const emailById = new Map(users.map((u) => [u.id, u.email]))
      const { data: rows, error } = await admin
        .from('feedback')
        .select('id, user_id, message, type, status, created_at')
        .order('created_at', { ascending: false })
      if (error) return json({ error: 'query failed', detail: error.message }, 500)
      const items = (rows ?? []).map((r) => ({
        id: r.id,
        email: emailById.get(r.user_id) ?? null,
        message: r.message,
        type: r.type ?? null,
        status: r.status ?? 'new',
        created_at: r.created_at,
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

      const { data: sess } = await admin
        .from('sessions')
        .select('created_at, deleted_at')
      const sessionsThisWeek = (sess ?? []).filter(
        (s) => !s.deleted_at && new Date(s.created_at).getTime() >= weekAgo,
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

      const [{ data: moon }, { data: sess }, { data: prefs }, { data: fb }, { data: consent }] = await Promise.all([
        admin.from('moon_snapshots').select('user_id, reflection'),
        admin.from('sessions').select('user_id, deleted_at'),
        admin.from('user_preferences').select('user_id, preferences'),
        admin.from('feedback').select('user_id'),
        admin.from('user_consent').select('user_id, kind, version, accepted, accepted_at, created_at'),
      ])

      const reflById = new Map<string, number>()
      for (const r of moon ?? []) {
        const txt = (r.reflection ?? '').toString().trim()
        if (txt) reflById.set(r.user_id, (reflById.get(r.user_id) ?? 0) + 1)
      }
      const sessById = new Map<string, number>()
      for (const s of sess ?? []) {
        if (s.deleted_at) continue
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
            marketing_consent: u.marketing_consent,
            consent: consentById.get(u.id) ?? {},
          }
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return json({ ok: true, rows })
    }

    if (action === 'analytics') {
      const range = (body?.range as string) || 'month'
      const nowMs = Date.now()
      const spanDays = range === 'week' ? 7 : range === 'all' ? 365 : 30
      const startMs = nowMs - spanDays * DAY

      const users = await fetchAllUsers(admin)
      const emailById = new Map(users.map((u) => [u.id, u.email]))

      const [{ data: sess }, { data: moon }, { data: prefs }] = await Promise.all([
        admin.from('sessions').select('user_id, created_at, deleted_at'),
        admin.from('moon_snapshots').select('reflection, date, created_at'),
        admin.from('user_preferences').select('user_id, preferences'),
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
        if (s.deleted_at) continue
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

      return json({
        ok: true,
        range,
        totalUsers: users.length,
        sessionsOverTime,
        reflectionsOverTime,
        funnel,
        topUsers,
      })
    }

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
