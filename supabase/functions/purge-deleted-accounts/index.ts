// ════════════════════════════════════════════════════════════════
//  purge-deleted-accounts — permanently deletes accounts whose
//  30-day grace window has passed.
// ════════════════════════════════════════════════════════════════
//  The browser only RECORDS a deletion request in
//  user_preferences.preferences->accountDeletion = { requested_at,
//  scheduled_for } (see apps/web/src/lib/api/account.js). This function — run
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

/* Constant-time string compare so the shared secret can't be recovered via
   response-timing analysis. (Length is allowed to leak, as is standard.) */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // The shared secret is the ONLY gate (the platform JWT gateway is off for
  // this function). FAIL CLOSED: if CRON_SECRET is unset/empty, refuse every
  // request rather than running this irreversible deletion sweep unauthenticated.
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!expected || !timingSafeEqual(provided, expected)) {
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
      // Revoke the Google Calendar OAuth grant FIRST. The auth.users delete
      // cascades and drops our copy of the token, but Google keeps the grant
      // live (Simplicity stays listed as an authorized app) until we revoke it.
      // Best-effort and never blocks the deletion. Mirrors the disconnect path
      // in the google-calendar function.
      try {
        const { data: integ } = await admin
          .from('user_integrations')
          .select('refresh_token')
          .eq('user_id', row.user_id)
          .eq('provider', 'google_calendar')
          .maybeSingle()
        if (integ?.refresh_token) {
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: integ.refresh_token }),
          }).catch(() => {})
        }
      } catch { /* revoke is best-effort; proceed with deletion regardless */ }

      // Cascade does the rest — all public + auth rows for this user go.
      const { error: delErr } = await admin.auth.admin.deleteUser(row.user_id)
      if (delErr) failed.push({ user_id: row.user_id, error: delErr.message })
      else deleted.push(row.user_id)
    }

    return json({ ok: true, scanned: data?.length ?? 0, due: due.length, deleted, failed })
  } catch (e) {
    console.error('purge-deleted-accounts error:', e)
    return json({ error: 'internal_error' }, 500)
  }
})
