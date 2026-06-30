/* ════════════════════════════════════════════════════════════════
   APP SESSION — usage heartbeat for the admin analytics.
   ════════════════════════════════════════════════════════════════
   Records ONE row in `app_sessions` per browser tab-session when a
   signed-in user opens the app. This is what the admin console counts
   as a "session" (an app open) — DISTINCT from the `sessions` table,
   which holds coaching sessions with clients.

   Mirrors landingEvents: fire-and-forget, deduped via sessionStorage so
   a token refresh, re-render, or route change never inflates the count.
   Failures are swallowed — recording a session must never block the app
   or surface an error to the user. */

import { supabase } from '../supabase'

const SENT_KEY = 'app_session_recorded'

/* Record one app-usage session for the signed-in user, at most once per
   browser tab-session. Safe to call on every auth-state change. */
export async function recordAppSession(userId) {
  if (!userId) return
  try {
    if (window.sessionStorage.getItem(SENT_KEY)) return
    window.sessionStorage.setItem(SENT_KEY, '1')
  } catch { /* sessionStorage unavailable — still record once */ }
  try {
    await supabase.from('app_sessions').insert({ user_id: userId })
  } catch { /* fire-and-forget — table missing pre-migration, offline, etc. */ }
}
