/* ════════════════════════════════════════════════════════════════
   ACCOUNT RESET — what "delete all my data" has to touch.
   ════════════════════════════════════════════════════════════════
   Both apps run the reset themselves — it is a sequence of RLS-scoped
   writes from the signed-in client — but WHAT it touches is one decision,
   not two. It used to be two copies of these lists. The phone's stopped at
   23 tables while the browser's grew to 30, and never gained the browser's
   disconnect and unpublish steps: a reset from the phone left booking,
   site and lead pages online and still taking submissions, Google Calendar
   and the invoice provider still connected, and payment plans,
   adjustments and meeting types behind.

   The steps, in the order each app runs them:
     1. ACCOUNT_RESET_DISCONNECTS — credentials first: they are the only
        thing here that grants access to a system OUTSIDE Simplicity, so
        they should stop being valid even if a later step fails
     2. hard-delete ACCOUNT_RESET_HARD_DELETE_TABLES
     3. unpublish ACCOUNT_RESET_UNPUBLISH_TABLES (published = false)
     4. soft-delete ACCOUNT_RESET_SOFT_DELETE_TABLES
     5. rpc report_tallies_reset_own
   ════════════════════════════════════════════════════════════════ */

/* Tables with a deleted_at column — soft-deleted, so the rows leave every
   list but stay restorable for the usual 30-day window. */
export const ACCOUNT_RESET_SOFT_DELETE_TABLES = [
  'transactions', 'recurring_templates', 'clients', 'projects', 'groups',
  'group_members', 'leads', 'tasks', 'goals', 'goal_entries', 'goal_categories',
  'reminders', 'categories', 'lead_sources', 'client_statuses', 'lead_statuses',
  'task_statuses', 'task_categories', 'user_questions', 'daily_answers', 'sessions',
  'user_quotes', 'calendar_events', 'meeting_types', 'payment_plans',
  'payment_installments', 'lead_pages', 'booking_pages', 'site_pages',
  'client_adjustments',
] as const

/* No deleted_at — physically removed. Child/log tables, so they go before
   the soft deletes to avoid any FK surprises. */
export const ACCOUNT_RESET_HARD_DELETE_TABLES = [
  'scheduled_meetings', 'client_status_log', 'lead_status_log', 'moon_snapshots',
] as const

/* Public builder pages. A soft delete only hides a page from its owner's
   lists; every public edge function 404s an UNPUBLISHED page, so this is
   the step that actually takes /p, /lead and /book offline. */
export const ACCOUNT_RESET_UNPUBLISH_TABLES = ['lead_pages', 'booking_pages', 'site_pages'] as const

/* Edge functions called with { action: 'disconnect' } — the same actions
   the connections screen uses. google-calendar revokes the refresh token AT
   GOOGLE before deleting our copy (deleting the row alone would leave
   Simplicity in the user's authorised apps); invoices drops the provider key
   and secret. `label` names the failure when one cannot be reached.

   Not listed: Grow. There are no Grow connections yet; add it here when
   that work is picked up, and both apps pick it up with it. */
export const ACCOUNT_RESET_DISCONNECTS = [
  { fn: 'google-calendar', label: 'Google Calendar' },
  { fn: 'invoices', label: 'שירות החשבוניות' },
] as const
