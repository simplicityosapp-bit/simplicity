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
//   - analytics               → { range: today|week|days30|month|all } sessions/reflections/funnel/top
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

/* Calendar days are the OWNER'S days, not UTC's. The console is read from
   Israel, and a "today" window that opened at 02:00 or 03:00 local would file
   last night's sessions under today. Intl carries the zone rules, DST
   included; if the runtime lacks it, everything degrades to UTC rather than
   throwing, since the analytics reads are not wrapped in soft(). */
const TZ = 'Asia/Jerusalem'
function zoneFormatter(): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return null
  }
}
const zoneFmt = zoneFormatter()
/* The wall clock of an instant in TZ, as numbers; null when Intl is missing. */
function wallClock(d: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } | null {
  if (!zoneFmt) return null
  const p: Record<string, string> = {}
  for (const part of zoneFmt.formatToParts(d)) p[part.type] = part.value
  const n = (k: string) => parseInt(p[k] ?? '', 10)
  const out = { y: n('year'), m: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute'), s: n('second') }
  return Number.isFinite(out.y) && Number.isFinite(out.m) && Number.isFinite(out.d) ? out : null
}
const pad2 = (n: number) => (n < 10 ? '0' : '') + n
/* YYYY-MM-DD of an instant, in the owner's calendar. */
const dayKey = (d: Date) => {
  const w = wallClock(d)
  return w ? w.y + '-' + pad2(w.m) + '-' + pad2(w.d) : d.toISOString().slice(0, 10)
}
/* TZ's offset from UTC at the instant ms, in ms (positive east of Greenwich). */
function zoneOffsetMs(ms: number): number {
  const w = wallClock(new Date(ms))
  if (!w) return 0
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000
}
/* The instant at which the owner's calendar day ymd begins. Two passes: a
   guess at UTC midnight corrected by the offset there, then once more so a
   DST switch sitting between the guess and the answer is absorbed. */
function dayStartMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const utcMidnight = Date.UTC(y, m - 1, d)
  let guess = utcMidnight
  for (let i = 0; i < 2; i++) guess = utcMidnight - zoneOffsetMs(guess)
  return guess
}
/* The calendar day n days after ymd — pure date arithmetic, no zone. */
function shiftDay(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/* PostgREST caps an unbounded select at db-max-rows (1000 on Supabase). Every
   read below used to be a bare .select(), so the moment a table passes 1000
   rows the console would silently show TRUNCATED numbers — wrong long before
   it was slow, and app_sessions / landing_events are the fast-growing ones.
   This is the same fix the web api layer got via selectAllRows: page through
   in explicit ranges until a short page says we're done.

   `build` must return a FRESH query each call — a PostgrestFilterBuilder can
   only be awaited once. */
const PAGE = 1000
/* The row shape can't be inferred: the schema is untyped here and the column
   list is a runtime string, so PostgREST widens the result to GenericStringError.
   Take the builder as "something rangeable" and let the caller name T. */
type Pageable = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}
async function selectAll<T = Record<string, unknown>>(build: () => Pageable): Promise<T[]> {
  const out: T[] = []
  // Same 100-page guard as fetchAllUsers — a backstop, not a real limit.
  for (let page = 0; page < 100; page++) {
    const from = page * PAGE
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as T[]
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}

/* The stats reads below used to destructure `{ data }` and ignore `error`, so
   a missing table (a migration not yet run) or a transient failure degraded
   that one figure to zero and left the rest of the screen working. selectAll /
   countRows throw instead, which would take the whole action down with a 500 —
   so wrap them in `soft` to keep exactly the old forgiving behaviour, minus
   the silence. feedback_list is deliberately NOT soft: it always did return a
   500 there, and a half-empty triage board would be worse than an error. */
function soft<T>(p: Promise<T>, fallback: T): Promise<T> {
  return p.catch((e) => {
    console.warn('[admin] read failed, using fallback:', String(e?.message ?? e))
    return fallback
  })
}

/* Row count without shipping the rows. Used for the dashboard counters, which
   used to pull whole tables into memory just to call .length on a filter. */
async function countRows(
  build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await build()
  if (error) throw new Error(error.message)
  return count ?? 0
}

/* The onboarding flow, mirroring apps/web/src/lib/preferences.js. Kept in sync
   by hand, which is exactly how it fell out of sync: the flow was cut from nine
   steps to four-plus-finish, this copy was not, and the admin funnel spent that
   time charting four steps (data_import / daily_questions / recurring / preview)
   that no user could reach. Every one of them read as 100% drop-off, and the
   percentages for the steps that DO exist were computed against the wrong
   denominator. A funnel that invents stages is worse than no funnel — it is a
   product decision made on a false number.

   If the list in preferences.js changes again, change it here in the same
   commit. There is no import to lean on: this runs on Deno in an edge function
   and does not bundle the web app. */
const ONBOARDING_STEPS = [
  'profile', 'projects', 'clients', 'goals', 'finish',
]
const STEP_LABELS: Record<string, string> = {
  profile: 'פרופיל',
  projects: 'פרויקטים',
  clients: 'לקוחות',
  goals: 'יעדים',
  finish: 'סיום',
}

/* Retired step keys, mapped to the surviving step that follows the work they
   used to do — the same table preferences.js uses to resume a parked user.
   Without it, `indexOf` returns -1 for a stored value like 'recurring', the
   Math.max below floors it to 0, and that user is silently reported as having
   stalled on step one. Not hypothetical: users are parked on retired steps
   right now, and each one would have been charted as a first-step drop-off. */
const RETIRED_STEPS: Record<string, string> = {
  data_import: 'projects',
  daily_questions: 'goals',
  recurring: 'goals',
  preview: 'goals',
}

type AdminPerms = { delete_users: boolean; set_subscriber: boolean; manage_admins: boolean }
type AuthUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; marketing_consent: boolean; is_admin: boolean; admin_perms: AdminPerms }

/* The service-role client — bypasses RLS, so every caller reaching it has
   already been gated. Built by a named factory purely so AdminClient below is
   the EXACT inferred type: the old `ReturnType<typeof createClient>` spelled
   the unparameterised generic, which doesn't match what createClient() infers. */
function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}
type AdminClient = ReturnType<typeof serviceClient>

/* Page through auth.users with the admin API (max 1000/page) so no user
   is missed once the beta grows past a single page. */
async function fetchAllUsers(admin: AdminClient): Promise<AuthUser[]> {
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

/* Furthest onboarding step a user reached, as an index into ONBOARDING_STEPS.
   completed/skipped → past the last step. A stored key that no longer exists is
   resolved through RETIRED_STEPS first, so a user who parked mid-flow before the
   redesign lands where their work actually got them rather than back at zero. */
function onboardingProgress(ob: any): { index: number; label: string; done: boolean } {
  if (!ob || typeof ob !== 'object') {
    return { index: 0, label: STEP_LABELS.profile, done: false }
  }
  if (ob.completed_at) return { index: ONBOARDING_STEPS.length, label: 'הושלם', done: true }
  if (ob.skipped_at) return { index: ONBOARDING_STEPS.length, label: 'דילג', done: true }
  const stored = ob.step || 'profile'
  const step = ONBOARDING_STEPS.includes(stored) ? stored : (RETIRED_STEPS[stored] ?? 'profile')
  const idx = Math.max(0, ONBOARDING_STEPS.indexOf(step))
  return { index: idx, label: STEP_LABELS[ONBOARDING_STEPS[idx]] ?? 'פרופיל', done: false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action as string

    // ── Service-role client — bypasses RLS; the caller is gated below. ──
    const admin = serviceClient()

    // ── Authorise the caller: EITHER the scoped feedback-CLI token, which
    //    unlocks ONLY the feedback triage actions (list/update) for the
    //    automation skills, OR a real admin login (owner / promoted admin).
    //    The token path carries NO admin perms, so the sensitive actions
    //    (delete_user / set_admin / …) still require a real login. ──
    const FEEDBACK_TOKEN = Deno.env.get('FEEDBACK_CLI_TOKEN') ?? ''
    const FEEDBACK_ACTIONS = new Set(['feedback_list', 'feedback_update', 'feedback_update_status'])
    const viaFeedbackToken =
      !!FEEDBACK_TOKEN
      && (req.headers.get('x-feedback-token') ?? '') === FEEDBACK_TOKEN
      && FEEDBACK_ACTIONS.has(action)

    let perms = { delete_users: false, set_subscriber: false, manage_admins: false }
    /* Declared OUT here, not inside the gate below.
       BUG FIX (2026-07-27): `user` and `isOwner` used to be `const`s inside the
       `if (!viaFeedbackToken)` block, but four actions read them AFTER it —
       `users` (caller.is_owner) and the self-target guards in delete_user /
       set_admin / revoke_admin. Being block-scoped, those reads threw
       ReferenceError, which the outer catch turned into a blanket 500. So the
       whole Users tab, and every admin-management action, were broken — not
       slow, broken. They start fail-closed (no user, not owner) so the
       feedback-token path, which never enters the gate, cannot inherit
       ownership. */
    let callerUser: { id: string; email: string | null } | null = null
    let isOwner = false
    if (!viaFeedbackToken) {
      // ── Real admin gate: a CONFIRMED-email owner or promoted admin JWT. ──
      const authHeader = req.headers.get('Authorization') ?? ''
      if (!authHeader) return json({ error: 'unauthorized' }, 401)
      const caller = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user }, error: authErr } = await caller.auth.getUser()
      if (authErr || !user) return json({ error: 'unauthorized' }, 401)
      if (!user.email_confirmed_at) return json({ error: 'forbidden' }, 403)
      // Admin = the hardcoded super-owner OR a user the owner promoted
      // (app_metadata.role === 'admin', set only by set_admin below).
      isOwner = (user.email ?? '').toLowerCase() === ADMIN_EMAIL
      const meta = (user.app_metadata ?? {}) as Record<string, unknown>
      const isPromoted = meta.role === 'admin'
      if (!isOwner && !isPromoted) return json({ error: 'forbidden' }, 403)
      callerUser = { id: user.id, email: user.email ?? null }
      // Effective permissions. The owner implicitly has every power; a promoted
      // admin has exactly the perms stamped on their metadata (default false).
      // These gate the sensitive actions below; read actions need only admin.
      const mp = (meta.admin_perms ?? {}) as Record<string, unknown>
      perms = {
        delete_users:   isOwner || mp.delete_users === true,
        set_subscriber: isOwner || mp.set_subscriber === true,
        manage_admins:  isOwner || mp.manage_admins === true,
      }
    }

    // ── Route ────────────────────────────────────────────────────
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

    // Delete feedback rows (single or bulk) from the admin board. Destructive —
    // the UI guards it behind a confirm dialog. NOT in the feedback-CLI token
    // set, so only a real admin login can delete (the automation token cannot).
    if (action === 'feedback_delete') {
      const raw = Array.isArray(body?.ids) ? body.ids : (body?.id ? [body.id] : [])
      const ids = [...new Set(raw)].filter((x) => typeof x === 'string' && UUID_RE.test(x))
      if (!ids.length) return json({ error: 'bad request' }, 400)
      /* CHUNKED. PostgREST puts `.in()` in the QUERY STRING, so one big delete
         blows the request-line limit: measured against this project, 600 ids
         still went through and 1200 came back "Bad Request" — as an opaque
         "delete failed" toast with nothing removed. Select-all-then-delete is
         precisely the call that grows, so it would have broken exactly when it
         was most useful. 200 keeps the URL near 8KB.

         `.select('id')` makes each delete RETURN the rows it actually removed,
         so the count below is real. It used to echo the REQUESTED length —
         deleting 600 ids that matched nothing still reported "600 deleted". */
      const CHUNK = 200
      const deleted: string[] = []
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await admin
          .from('feedback').delete().in('id', ids.slice(i, i + CHUNK)).select('id')
        if (error) {
          // Report what DID go through — a later chunk failing doesn't put the
          // earlier ones back, and the client re-syncs from the server on error.
          return json({ error: 'delete failed', detail: error.message, deleted: deleted.length }, 500)
        }
        for (const r of (data ?? []) as { id: string }[]) deleted.push(r.id)
      }
      return json({ ok: true, deleted: deleted.length, ids: deleted })
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
      // Fail closed: no identified caller → refuse rather than skip the guard.
      if (!callerUser || uid === callerUser.id) return json({ error: 'cannot delete the owner account' }, 400)
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
      // Fail closed: no identified caller → refuse rather than skip the guard.
      if (!callerUser || uid === callerUser.id) return json({ error: 'cannot change your own admin status' }, 400)
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
      // Fail closed: no identified caller → refuse rather than skip the guard.
      if (!callerUser || uid === callerUser.id) return json({ error: 'cannot change your own admin status' }, 400)
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
      const FULL = 'id, user_id, message, type, status, created_at, platform, source, classification, surface, title, notes'
      const BASE = 'id, user_id, message, type, status, created_at'
      /* Both halves run CONCURRENTLY. The user list is only here to resolve
         user_id → email, so it has no reason to block the feedback query; run
         serially it added a whole GoTrue round-trip to the board's latency. */
      const feedbackRows = () => {
        const q = (cols: string) => () => admin.from('feedback').select(cols).order('created_at', { ascending: false })
        return selectAll(q(FULL)).catch((e) => {
          // Deploy-order resilience: if this edge ships before migration 0079
          // adds the triage columns, PostgREST errors on the unknown columns —
          // fall back to the base select so the board still loads (triage
          // fields just empty). Anything else is a real failure: rethrow.
          if (!/column|does not exist|schema cache|find/i.test(String(e?.message ?? e))) throw e
          return selectAll(q(BASE))
        })
      }
      let users: AuthUser[]
      let rows: Record<string, any>[]
      try {
        ;[users, rows] = await Promise.all([fetchAllUsers(admin), feedbackRows()])
      } catch (e) {
        return json({ error: 'query failed', detail: String((e as Error)?.message ?? e) }, 500)
      }
      const emailById = new Map(users.map((u) => [u.id, u.email]))
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
      const nowMs = Date.now()
      const weekAgo = nowMs - 7 * DAY
      const weekAgoIso = new Date(weekAgo).toISOString()

      /* COUNTED IN THE DATABASE, NOT IN MEMORY. These four used to run one
         after another, each pulling a whole table across the wire only to
         call .length on a filtered copy — every app_sessions row ever just to
         count one week, every user's whole preferences blob just to count
         subscribers. Now they run concurrently and, where possible, the
         database does the counting and returns a number. */
      const [users, openFeedback, sessionsThisWeek, subscribers] = await Promise.all([
        fetchAllUsers(admin),

        // Open = anything not done. A null status is open too (it predates the
        // default), and `neq` alone would drop those, hence the explicit or.
        soft(countRows(() => admin.from('feedback')
          .select('id', { count: 'exact', head: true })
          .or('status.is.null,status.neq.done')), 0),

        // "sessions" here = app-usage opens (app_sessions, migration 0076), NOT
        // coaching sessions. Empty until the migration runs / sessions accrue.
        soft(countRows(() => admin.from('app_sessions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', weekAgoIso)), 0),

        // Manually-flagged subscribers (preferences.subscription.manual) —
        // .paid wins for a real payment. Selects just the `subscription`
        // sub-object instead of the whole preferences blob. Falls back to the
        // full column if this PostgREST doesn't take the JSON path, matching
        // the deploy-order resilience in feedback_list.
        soft((async () => {
          const pick = (cols: string) => () => admin.from('user_preferences').select(cols)
          const isSub = (s: any) => s?.manual === true || s?.paid === true
          try {
            const rows = await selectAll<{ sub: any }>(pick('sub:preferences->subscription'))
            return rows.filter((p) => isSub(p.sub)).length
          } catch {
            const rows = await selectAll<{ preferences: any }>(pick('preferences'))
            return rows.filter((p) => isSub(p?.preferences?.subscription)).length
          }
        })(), 0),
      ])

      const active7d = users.filter(
        (u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= weekAgo,
      ).length

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
      /* fetchAllUsers joins the same Promise.all instead of gating it — it has
         no dependency on the table reads, and awaiting it first added a whole
         GoTrue round-trip in front of six queries that could have been running
         meanwhile. Each read is paged (selectAll) so none of these counts can
         be silently capped at 1000 rows. moon_snapshots drops null/empty
         reflections in the DB rather than shipping them to be discarded here;
         the trim() below still runs, so whitespace-only rows count exactly as
         they did before. */
      const [users, moon, sess, prefs, fb, consent, subs] = await Promise.all([
        fetchAllUsers(admin),
        soft(selectAll<{ user_id: string; reflection: string | null }>(
          () => admin.from('moon_snapshots').select('user_id, reflection')
            .not('reflection', 'is', null).neq('reflection', '')), []),
        soft(selectAll<{ user_id: string }>(() => admin.from('app_sessions').select('user_id')), []),
        soft(selectAll<{ user_id: string; preferences: any }>(
          () => admin.from('user_preferences').select('user_id, preferences')), []),
        soft(selectAll<{ user_id: string }>(() => admin.from('feedback').select('user_id')), []),
        soft(selectAll<any>(() => admin.from('user_consent')
          .select('user_id, kind, version, accepted, accepted_at, created_at')), []),
        // New billing model: tier + beta exemption + locked terms (migration 0075).
        soft(selectAll<any>(() => admin.from('user_subscriptions')
          .select('user_id, tier, beta_exempt_until, subscribed_at, locked_price')), []),
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
      /* Five windows, all ending now; EVERY card on the screen is read over
         the chosen one:
           today  → since midnight on the owner's clock (see dayKey above)
           week   → the last 7 days
           days30 → the last 30 days (the console's default)
           month  → the current calendar month, from the 1st
           all    → from the first row of data we hold, with no cap
         "all" used to be a silent 365-day cap — a pill that said everything
         and was not. It has no floor up front: the reads come back
         unwindowed and the floor is found from the data itself, below. */
      const range = (body?.range as string) || 'days30'
      const nowMs = Date.now()
      const now = new Date(nowMs)
      const today = dayKey(now)
      const windowStart: number | null =
        range === 'today' ? dayStartMs(today)
        : range === 'week' ? nowMs - 7 * DAY
        : range === 'month' ? dayStartMs(today.slice(0, 8) + '01')
        : range === 'all' ? null
        : nowMs - 30 * DAY

      const startIso = windowStart == null ? null : new Date(windowStart).toISOString()

      /* fetchAllUsers joins the batch rather than gating it, and the three
         time-series reads are now WINDOWED IN THE DATABASE. They used to pull
         every app_sessions / landing_events row ever written and then throw
         away everything outside the range in JS — for the default 30-day view
         that is almost the whole table, and it grows with every app open and
         every anonymous landing visit. Paged via selectAll so a busy month
         can't be silently cut off at 1000 rows either.

         The onboarding funnel is windowed by SIGNUP date below (the window's
         cohort), so the prefs read stays unwindowed here: someone who signed
         up inside the window may have finished onboarding after it. */
      const [users, sess, moon, prefs, landing] = await Promise.all([
        fetchAllUsers(admin),
        soft(selectAll<{ user_id: string; created_at: string }>(
          () => {
            const q = admin.from('app_sessions').select('user_id, created_at')
            return startIso ? q.gte('created_at', startIso) : q
          }), []),
        // Windowed on created_at; `date` (the snapshot's own day) is preferred
        // below when present, so keep the row-created floor slightly generous.
        soft(selectAll<{ reflection: string | null; date: string | null; created_at: string }>(
          () => {
            const q = admin.from('moon_snapshots').select('reflection, date, created_at')
              .not('reflection', 'is', null).neq('reflection', '')
            return startIso ? q.gte('created_at', startIso) : q
          }), []),
        soft(selectAll<{ user_id: string; preferences: any }>(
          () => admin.from('user_preferences').select('user_id, preferences')), []),
        // Anonymous landing funnel events (empty if migration 0050 hasn't run yet).
        soft(selectAll<{ type: string; created_at: string }>(
          () => {
            const q = admin.from('landing_events').select('type, created_at')
            return startIso ? q.gte('created_at', startIso) : q
          }), []),
      ])
      const emailById = new Map(users.map((u) => [u.id, u.email]))

      /* `all`: the window opens at the oldest thing we know about — the first
         session, reflection, landing visit or signup — so the chart runs from
         the day the data starts. A loop rather than Math.min(...spread): these
         arrays can run to tens of thousands of rows, past the argument limit. */
      let firstMs = Infinity
      if (windowStart == null) {
        const see = (iso: string | null | undefined) => {
          if (!iso) return
          const t = new Date(iso).getTime()
          if (Number.isFinite(t) && t < firstMs) firstMs = t
        }
        for (const s of sess ?? []) see(s.created_at)
        for (const m of moon ?? []) see((m.date as string) || m.created_at)
        for (const e of landing ?? []) see(e.created_at)
        for (const u of users) see(u.created_at)
      }
      // No data at all → fall back to the default window rather than an empty axis.
      const startMs: number = windowStart ?? (Number.isFinite(firstMs) ? firstMs : nowMs - 30 * DAY)

      /* Empty daily buckets across the span, oldest → newest, plus a
         date → bucket index so bump() is a hash lookup. It used to be
         buckets.find() INSIDE the per-row loop, i.e. a linear scan of up to
         365 buckets for every session and every reflection. */
      type Bucket = { date: string; count: number }
      const makeBuckets = (): { list: Bucket[]; byDate: Map<string, Bucket> } => {
        const list: Bucket[] = []
        const byDate = new Map<string, Bucket>()
        // Calendar days from the window's first day to today, inclusive —
        // date arithmetic rather than +24h steps, so a DST switch can't
        // double or skip a day. The guard is a backstop, not a limit.
        const first = dayKey(new Date(startMs))
        for (let i = 0; i < 20000; i++) {
          const key = shiftDay(first, i)
          const b = { date: key, count: 0 }
          list.push(b)
          byDate.set(key, b)
          if (key >= today) break
        }
        return { list, byDate }
      }
      const bump = (buckets: { byDate: Map<string, Bucket> }, key: string) => {
        const hit = buckets.byDate.get(key)
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

      /* Signups inside the window — the cohort the per-user cards below are
         read over. It used to be every user ever, which left the onboarding
         funnel as the one card the pills did not touch. */
      const cohort = users.filter((u) => u.created_at && new Date(u.created_at).getTime() >= startMs)

      // Onboarding funnel — how many of the window's signups reached each step.
      // Resolve each user's furthest step once, then bucket by index.
      const obIndexById = new Map<string, number>()
      for (const p of prefs ?? []) {
        obIndexById.set(p.user_id, onboardingProgress(p.preferences?.onboarding).index)
      }
      const reachedIdx = cohort.map((u) => obIndexById.get(u.id) ?? 0)
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
      const lpSignups = cohort.length
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
        sessionsOverTime: sessionsOverTime.list,
        reflectionsOverTime: reflectionsOverTime.list,
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
