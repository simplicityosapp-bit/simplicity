// ════════════════════════════════════════════════════════════════
//  purge-trash — permanently removes what the trash stopped showing.
// ════════════════════════════════════════════════════════════════
//  The trash lists items deleted in the last 30 days and offers restore.
//  After 30 days an item drops off the list and can never be restored,
//  but nothing removed it — so it sat in the database forever, and the
//  guide claimed a permanent deletion that never happened. This closes
//  that gap on a nightly schedule.
//
//  ORDER MATTERS. Reports are computed from report_tallies (migration
//  0100) for flow metrics and from frozen per-month values (0101) for the
//  two "as of" snapshots. The counters are already independent of the
//  rows, but a snapshot is only frozen for a month once someone freezes
//  it — so this ALWAYS snapshots the month that just closed BEFORE it
//  deletes anything. Purge first and that month would lose its "active
//  clients at the end" for good.
//
//  THE DELETION ITSELF lives in SQL (public.purge_trash), not here: it
//  has to skip any row still referenced by a LIVE row, and several
//  foreign keys are ON DELETE CASCADE — clients→sessions,
//  projects→groups→sessions. A naive sweep destroys live data. The guard
//  is generated from pg_constraint so a new foreign key is respected
//  without editing anything. See migration 0102.
//
//  SECURITY:
//   - service_role (admin) client — never expose it.
//   - Takes NO ids from the request. The only inputs are a dry-run flag
//     and a retention window, so hitting the endpoint cannot target
//     anything the schedule would not have removed anyway.
//   - Gated by the shared secret header (x-cron-secret), like the other
//     crons.
//
//  SAFETY:
//   - DRY RUN IS THE DEFAULT. It reports what it would remove and writes
//     nothing. Deleting requires an explicit {"dryRun": false}, so a
//     mis-fired call is inert.
//   - `days` cannot go below 30: the trash promises a 30-day window, and
//     a smaller number would delete something a user could still see and
//     restore.
//
//  Deploy:    supabase functions deploy purge-trash --no-verify-jwt
//             The flag is required: pg_cron posts with the shared secret
//             and no JWT, so the gateway would 401 before this runs.
//  Secret:    supabase secrets set CRON_SECRET=<random-long-string>
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* First day of the month that has just CLOSED, in the app timezone — the one
   whose snapshot must exist before its rows can go. Derived the same way
   report_month() does it, so the two agree on where a month begins. */
function lastClosedMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit',
  }).formatToParts(now)
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  return `${prev.y}-${String(prev.m).padStart(2, '0')}-01`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) return json({ error: 'CRON_SECRET not configured' }, 500)
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!timingSafeEqual(given, secret)) return json({ error: 'unauthorized' }, 401)

  let body: { dryRun?: boolean; days?: number } = {}
  try { body = await req.json() } catch { /* no body → defaults */ }

  // Deleting is opt-in. Anything other than an explicit false stays a dry run.
  const dryRun = body.dryRun !== false
  // Never below the 30 days the trash promises.
  const days = Math.max(30, Number.isFinite(body.days) ? Number(body.days) : 30)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const period = lastClosedMonth(new Date())

  /* Step 1 — freeze the closed month for every user, ALWAYS, even on a dry
     run. It is idempotent (overwrites, never accumulates) and costs nothing,
     and running it here means a schedule that never gets its dryRun:false
     still keeps the snapshots current. */
  const { error: snapErr } = await admin.rpc('report_snapshot_backfill')
  if (snapErr) return json({ error: `snapshot failed, nothing purged: ${snapErr.message}` }, 500)

  /* Step 2 — and only now, remove the rows. */
  const { data, error } = await admin.rpc('purge_trash', { p_dry_run: dryRun, p_days: days })
  if (error) return json({ error: error.message }, 500)

  const rows = (data ?? []) as { table_name: string; purged: number; skipped: number }[]
  const touched = rows.filter((r) => r.purged > 0 || r.skipped > 0)
  return json({
    dryRun,
    days,
    snapshottedThrough: period,
    totalPurged: rows.reduce((s, r) => s + r.purged, 0),
    // Rows still referenced by something live. They are reconsidered every
    // run, so this converges as their children are deleted in turn.
    totalSkipped: rows.reduce((s, r) => s + r.skipped, 0),
    tables: touched,
  })
})
