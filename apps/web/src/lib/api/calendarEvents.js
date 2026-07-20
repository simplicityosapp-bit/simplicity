/* ════════════════════════════════════════════════════════════════
   CALENDAR EVENTS — Trash adapters (list + restore hidden events).
   ════════════════════════════════════════════════════════════════
   The live read + all sync/assign/hide logic lives in the
   useCalendarEvents hook (React-Query-backed). These two functions
   exist only for the generic Trash drawer.

   A "hidden" calendar event is one the user removed from the app view —
   a resolved duplicate (dismissEvent), an auto-hidden near-exact
   duplicate, or a deleted synced event (deleteEvent). All three set
   owned=true + deleted_at, which is exactly this filter. Sync-driven
   cancellations (owned=false + deleted_at, set when the Google event is
   cancelled) are excluded — restoring those in-app would fight the sync.

   One-way sync means the underlying event still lives in the user's
   Google Calendar regardless, so this is a convenience restore, not the
   only recovery path.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

export async function listDeletedCalendarEvents() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return selectAllRows(() => supabase
    .from('calendar_events')
    .select('*')
    .eq('owned', true)
    .not('deleted_at', 'is', null)
    .gte('deleted_at', thirtyDaysAgo.toISOString())
    .order('deleted_at', { ascending: false }))
}

export async function restoreCalendarEvent(id) {
  /* Keep owned=true so the restored event stays visible and detached from
     the one-way sync — it won't be re-clobbered nor re-auto-hidden. */
  const { error } = await supabase
    .from('calendar_events')
    .update({ owned: true, deleted_at: null })
    .eq('id', id)
  if (error) throw error
}
