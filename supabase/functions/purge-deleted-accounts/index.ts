// ════════════════════════════════════════════════════════════════
//  purge-deleted-accounts — permanently deletes accounts whose
//  30-day grace window has passed.
// ════════════════════════════════════════════════════════════════
//  The browser only RECORDS a deletion request in
//  user_preferences.preferences->accountDeletion = { requested_at,
//  scheduled_for } (see src/lib/api/account.js). This function — run
//  on a daily schedule — finds every account whose scheduled_for is
//  in the past and calls admin.deleteUser(). Because every table has
//  `user_id ... ON DELETE CASCADE` on auth.users, that single call
//  wipes ALL of the user's rows (public + auth schemas) for real.
//
//  SECURITY:
//   - Uses the service_role key (admin) — NEVER expose this client.
//   - The function takes NO user id from the request body; it derives
//     the victim list itself, purely from elapsed time. So even if the
//     endpoint is hit, it can only ever delete already-expired accounts.
//   - Still gated by a shared secret header (x-cron-secret) for defense
//     in depth, so randoms can't trigger the sweep.
//
//  Deploy:    supabase functions deploy purge-deleted-accounts
//  Secret:    supabase secrets set CRON_SECRET=<random-long-string>
//  Schedule:  see purge-deleted-accounts.README.md (daily via pg_cron).
//
//  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically
//  into every edge function — no need to set them as secrets.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Defense-in-depth: only the scheduler (which knows the secret) may run this.
  const expected = Deno.env.get('CRON_SECRET')
  if (expected && req.headers.get('x-cron-secret') !== expected) {
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch every prefs row and decide in JS — no JSONB-path filter in the
    // query, so there's no PostgREST syntax to get wrong on first deploy.
    // (Beta scale is small; revisit with a server-side filter if it grows.)
    const { data, error } = await admin
      .from('user_preferences')
      .select('user_id, preferences')

    if (error) return json({ error: 'query failed', detail: error.message }, 500)

    const nowMs = Date.now()
    const due = (data ?? []).filter((row) => {
      const at = row?.preferences?.accountDeletion?.scheduled_for
      const t = at ? new Date(at).getTime() : NaN
      return Number.isFinite(t) && t <= nowMs
    })

    const deleted: string[] = []
    const failed: { user_id: string; error: string }[] = []
    for (const row of due) {
      // Cascade does the rest — all public + auth rows for this user go.
      const { error: delErr } = await admin.auth.admin.deleteUser(row.user_id)
      if (delErr) failed.push({ user_id: row.user_id, error: delErr.message })
      else deleted.push(row.user_id)
    }

    return json({ ok: true, scanned: data?.length ?? 0, due: due.length, deleted, failed })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
