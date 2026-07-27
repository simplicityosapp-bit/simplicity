// ════════════════════════════════════════════════════════════════
//  scheduled-meetings-cron — materialises recurring meetings for
//  coaches who are not currently using the app.
// ════════════════════════════════════════════════════════════════
//  The generation engine has always run client-side (HomeGenerators +
//  the calendar screen), with a now−14d → now+4w window. That is fine
//  while a coach opens the app, and useless when they don't: two beta
//  accounts had no app_session at all, so their weekly meetings simply
//  stopped being created — and because the lookback is only 14 days,
//  every occurrence older than that is lost for good once they return.
//  Running the same engine nightly means the window never lapses.
//
//  ONE IMPLEMENTATION: the rules come from packages/core, the very
//  module the browser runs. Do not re-implement them here — that is
//  how recurring_start_date/recurring_end_date ended up honoured
//  nowhere. That module deliberately imports nothing so this bundles.
//
//  SECURITY:
//   - service_role (admin) client — never expose it.
//   - Takes NO user id from the request: it derives the list itself
//     from who owns a recurring subject. The body only carries flags.
//   - Gated by a shared secret header (x-cron-secret), same one the
//     purge cron uses.
//
//  SAFETY:
//   - `{"dryRun": true}` computes everything and writes nothing.
//   - Aborts before any write if the runtime cannot resolve the
//     coach's time zone (see assertTimeZoneWorks).
//   - Only ever INSERTs. It never updates or deletes a meeting, so a
//     confirmed or skipped row can't be disturbed.
//
//  Deploy:    supabase functions deploy scheduled-meetings-cron --no-verify-jwt
//             The flag is required: pg_cron posts with the shared secret and
//             no JWT, so with verification on the gateway 401s the call before
//             this file ever runs. The secret check below is the real gate.
//  Secret:    supabase secrets set MEETINGS_CRON_SECRET=<random-long-string>
//             Its own secret rather than the purge cron's CRON_SECRET: the
//             CLI only ever shows a digest, so a shared secret cannot be
//             read back to verify a run, and rotating one job's key would
//             silently break the other's schedule.
//  Schedule:  see README.md (daily via pg_cron).
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  generateScheduledMeetings,
  zonedParts,
  DEFAULT_TIME_ZONE,
} from '../../../packages/core/src/domain/scheduledMeetings.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/* Constant-time compare so the shared secret can't be recovered via
   response-timing analysis. (Length is allowed to leak, as is standard.) */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* A runtime without full ICU data resolves an unknown zone to UTC instead of
   failing, which would silently write every meeting a few hours off — the
   exact class of bug this function exists downstream of. Check against a
   known instant before touching anything: 2026-07-01T00:00Z is 03:00 in
   Israel (UTC+3, summer). If that doesn't hold, refuse to run. */
function assertTimeZoneWorks(timeZone: string): void {
  const probe = zonedParts(new Date('2026-07-01T00:00:00Z'), timeZone)
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false })
      .format(new Date('2026-07-01T00:00:00Z')),
  )
  if (timeZone === DEFAULT_TIME_ZONE && (hour !== 3 || probe.day !== 1)) {
    throw new Error(
      `time zone ${timeZone} unavailable in this runtime (read hour ${hour}, day ${probe.day}) — refusing to write`,
    )
  }
}

/* PostgREST caps a plain select at 1000 rows. Every read here pages, because
   this function reads across ALL users and the cap has already bitten this
   codebase once (the app-wide list-read truncation fixed in 9a753a5). */
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    const rows = data || []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('MEETINGS_CRON_SECRET') || ''
  const given = req.headers.get('x-cron-secret') || ''
  if (!secret || !timingSafeEqual(secret, given)) return json({ error: 'forbidden' }, 403)

  let body: { dryRun?: boolean; timeZone?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const dryRun = body.dryRun === true
  const timeZone = body.timeZone || DEFAULT_TIME_ZONE

  try {
    assertTimeZoneWorks(timeZone)
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const now = new Date()
  const summary = {
    ok: true,
    dryRun,
    timeZone,
    ranAt: now.toISOString(),
    users: 0,
    owed: 0,
    created: 0,
    alreadyThere: 0,
    failed: 0,
    perUser: [] as Array<{ user_id: string; owed: number; created: number; sample: string[] }>,
    errors: [] as string[],
  }

  try {
    /* Who even has a recurring subject? Deriving the list from the data —
       rather than walking auth.users — keeps the work proportional to the
       coaches who actually run a weekly slot. */
    const [recurringClients, recurringGroups] = await Promise.all([
      selectAll<{ user_id: string }>((f, t) => admin.from('clients')
        .select('user_id').is('deleted_at', null).not('recurring_day', 'is', null).range(f, t)),
      selectAll<{ user_id: string }>((f, t) => admin.from('groups')
        .select('user_id').is('deleted_at', null).not('recurring_day', 'is', null).range(f, t)),
    ])
    const userIds = [...new Set([...recurringClients, ...recurringGroups].map((r) => r.user_id))]
    summary.users = userIds.length

    for (const userId of userIds) {
      try {
        /* Per user, not one global read: keeps each page small and means one
           coach's bad data can never stall everyone else's generation.
           ALL groups (not just recurring ones) — effectiveClientMeta reads
           group statuses to decide whether a member is still active. */
        const [clients, groups, members, meetings] = await Promise.all([
          selectAll((f, t) => admin.from('clients').select(
            'id, created_at, deleted_at, status_meta, status, status_overridden, recurring_day, recurring_time, recurring_start_date, recurring_end_date',
          ).eq('user_id', userId).is('deleted_at', null).range(f, t)),
          selectAll((f, t) => admin.from('groups').select(
            'id, created_at, deleted_at, status, recurring_day, recurring_time, recurring_start_date, recurring_end_date',
          ).eq('user_id', userId).is('deleted_at', null).range(f, t)),
          selectAll((f, t) => admin.from('group_members')
            .select('client_id, group_id, left_at, deleted_at').eq('user_id', userId).is('deleted_at', null).range(f, t)),
          selectAll((f, t) => admin.from('scheduled_meetings')
            .select('subject_type, subject_id, scheduled_at').eq('user_id', userId).range(f, t)),
        ])

        const due = generateScheduledMeetings(clients, groups, meetings, now, { members, timeZone })
        summary.owed += due.length
        const entry = {
          user_id: userId,
          owed: due.length,
          created: 0,
          sample: due.slice(0, 3).map((d) => d.scheduled_at),
        }

        if (due.length && !dryRun) {
          /* Row by row on purpose. A bulk insert is rejected as a whole if a
             single row trips the partial unique index on pending meetings —
             which happens whenever the coach's own browser materialised the
             same slot moments earlier. Losing the batch to a race would be
             worse than the extra round-trips at this volume. */
          for (const row of due) {
            const { error } = await admin.from('scheduled_meetings').insert({ ...row, user_id: userId })
            if (!error) { entry.created++; summary.created++; continue }
            const code = (error as { code?: string }).code
            if (code === '23505') { summary.alreadyThere++; continue }   // the browser won the race
            summary.failed++
            summary.errors.push(`${userId}: ${(error as { message?: string }).message ?? String(error)}`)
          }
        }
        summary.perUser.push(entry)
      } catch (e) {
        summary.failed++
        summary.errors.push(`${userId}: ${String(e)}`)
      }
    }
  } catch (e) {
    return json({ ...summary, ok: false, error: String(e) }, 500)
  }

  return json(summary)
})
