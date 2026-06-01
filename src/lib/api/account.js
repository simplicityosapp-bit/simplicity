/* ════════════════════════════════════════════════════════════════
   ACCOUNT — destructive account-wide operations.
   ════════════════════════════════════════════════════════════════
   resetAllUserData() wipes EVERY user-owned record so the account
   starts from zero. RLS scopes every statement to the signed-in user
   (auth.uid() = user_id), so no explicit user filter is needed.

   Two kinds of tables:
     - SOFT-DELETE tables (have a deleted_at column) → we set deleted_at
       so the rows vanish from every list (which all filter deleted_at
       IS NULL) but stay restorable for the usual 30-day window.
     - HARD-DELETE tables (logs / occurrences / snapshots with no
       deleted_at) → we physically remove the rows.
   user_preferences is intentionally LEFT ALONE (the caller resets the
   onboarding flow separately); we never touch auth or the account row.
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

/* Tables with a deleted_at column — soft-deleted. Order doesn't matter
   (rows stay, so FKs remain valid). */
const SOFT_DELETE_TABLES = [
  'transactions', 'recurring_templates', 'clients', 'projects', 'groups',
  'group_members', 'leads', 'tasks', 'goals', 'goal_entries', 'goal_categories',
  'reminders', 'categories', 'lead_sources', 'client_statuses', 'lead_statuses',
  'user_questions', 'daily_answers', 'sessions', 'session_attachments', 'client_notes',
]

/* Tables without deleted_at — physically deleted. These are child/log
   tables, so removing them first avoids any FK surprises. */
const HARD_DELETE_TABLES = [
  'reminder_occurrences', 'scheduled_meetings', 'client_status_log',
  'lead_status_log', 'moon_snapshots',
]

/* A filter that matches every row the caller can see (RLS already scopes
   to the user). PostgREST refuses an unfiltered update/delete, so we pass
   a tautology on the always-present id column. */
const ALL_ROWS = (q) => q.not('id', 'is', null)

export async function resetAllUserData() {
  const failed = []

  /* Hard-delete the child/log tables first. */
  for (const table of HARD_DELETE_TABLES) {
    const { error } = await ALL_ROWS(supabase.from(table).delete())
    if (error) failed.push(`${table}: ${error.message}`)
  }

  /* Soft-delete everything else. */
  const now = new Date().toISOString()
  for (const table of SOFT_DELETE_TABLES) {
    const { error } = await ALL_ROWS(supabase.from(table).update({ deleted_at: now }).is('deleted_at', null))
    if (error) failed.push(`${table}: ${error.message}`)
  }

  if (failed.length) throw new Error(`חלק מהנתונים לא נמחקו — ${failed.join(' · ')}`)
}
