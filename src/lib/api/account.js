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

/* ════════════════════════════════════════════════════════════════
   ACCOUNT DELETION — permanent, with a 30-day grace window.
   ════════════════════════════════════════════════════════════════
   Unlike resetAllUserData() (which wipes rows but KEEPS the account),
   deleting the account removes the auth.users row itself — and every
   table cascades away with it (ON DELETE CASCADE on user_id). That
   delete needs the service_role key, so it can't run from the browser.

   Flow:
     1. The browser RECORDS the request in user_preferences (a plain
        JSONB key — no schema change), with requested_at + scheduled_for.
     2. While scheduled_for is in the future the app is gated to a
        "pending deletion" screen; the user may CANCEL (clears the key)
        and return to normal use.
     3. A scheduled edge function (purge-deleted-accounts) finds every
        account whose scheduled_for has passed and calls admin.deleteUser.

   We never delete the auth user from the client — only mark intent. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30

/* Build the prefs.accountDeletion record for a fresh request. */
export function buildAccountDeletionRequest(now = new Date()) {
  const requestedMs = now.getTime()
  const scheduledMs = requestedMs + ACCOUNT_DELETION_GRACE_DAYS * 86400000
  return {
    requested_at: new Date(requestedMs).toISOString(),
    scheduled_for: new Date(scheduledMs).toISOString(),
  }
}
