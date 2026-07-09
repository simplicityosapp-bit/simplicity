// Destructive account operations — ported from web lib/api/account.js so the two
// behave identically. resetAllUserData() wipes every user-owned row (soft-delete
// where possible, hard-delete for logs). Account DELETION is grace-period based:
// the client only RECORDS the request in prefs.accountDeletion (the auth user is
// removed by a scheduled edge function — needs the service role); meanwhile the
// app gates to a "pending deletion" screen and the user may cancel.
import { supabase } from './supabase'

const SOFT_DELETE_TABLES = [
  'transactions', 'recurring_templates', 'clients', 'projects', 'groups',
  'group_members', 'leads', 'tasks', 'goals', 'goal_entries', 'goal_categories',
  'reminders', 'categories', 'lead_sources', 'client_statuses', 'lead_statuses',
  'task_statuses', 'task_categories', 'user_questions', 'daily_answers', 'sessions',
  'user_quotes', 'calendar_events',
]
const HARD_DELETE_TABLES = ['scheduled_meetings', 'client_status_log', 'lead_status_log', 'moon_snapshots']

// RLS scopes every statement to the signed-in user; PostgREST refuses an
// unfiltered update/delete, so pass a tautology on the always-present id column.
const ALL_ROWS = (q) => q.not('id', 'is', null)

export async function resetAllUserData() {
  const failed = []
  for (const table of HARD_DELETE_TABLES) {
    const { error } = await ALL_ROWS(supabase.from(table).delete())
    if (error) failed.push(`${table}: ${error.message}`)
  }
  const now = new Date().toISOString()
  for (const table of SOFT_DELETE_TABLES) {
    const { error } = await ALL_ROWS(supabase.from(table).update({ deleted_at: now }).is('deleted_at', null))
    if (error) failed.push(`${table}: ${error.message}`)
  }
  if (failed.length) throw new Error(`חלק מהנתונים לא נמחקו — ${failed.join(' · ')}`)
}

export const ACCOUNT_DELETION_GRACE_DAYS = 30

// prefs.accountDeletion record for a fresh request (30-day grace).
export function buildAccountDeletionRequest(now = new Date()) {
  const requestedMs = now.getTime()
  const scheduledMs = requestedMs + ACCOUNT_DELETION_GRACE_DAYS * 86400000
  return { requested_at: new Date(requestedMs).toISOString(), scheduled_for: new Date(scheduledMs).toISOString() }
}

// True while a recorded deletion is still within its grace window.
export function isDeletionPending(prefs) {
  const d = prefs?.accountDeletion
  return !!(d && d.scheduled_for && new Date(d.scheduled_for).getTime() > Date.now())
}
