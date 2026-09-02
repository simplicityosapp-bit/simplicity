-- ════════════════════════════════════════════════════════════════
-- Migration 0113 — RLS init-plan, the missing app_sessions FK, and FK indexes
-- Date: 2026-08-27
-- ════════════════════════════════════════════════════════════════
-- Three findings that share one property: all of them are invisible at beta
-- size and none of them are fixable later without a migration exactly like this
-- one. Nothing here changes who can see what, and nothing deletes a row.
--
-- ── PART A — auth.uid() is re-evaluated for every row (64 policies)
--   `user_id = auth.uid()` makes Postgres call auth.uid() once PER ROW SCANNED.
--   `user_id = (SELECT auth.uid())` makes it an InitPlan: evaluated once for the
--   whole statement, then compared as a constant. Identical semantics — same
--   function, same value, same authorisation decision — purely a matter of where
--   the planner puts the call. This is the single best-known Supabase scaling
--   mistake, and Supabase's own performance advisor flags all 64 as
--   `auth_rls_initplan`.
--
--   At 45 clients and 132 transactions it is unmeasurable. At a coach with 3,000
--   transactions and 2,000 calendar events, every table scan makes thousands of
--   function calls, and the reports and finance screens slow down in a way no
--   amount of client-side work can recover. Three hardening rounds (0045 / 0099
--   / 0107) all went past this because all three were about security.
--
--   Done by rewriting from the catalog rather than by hand: 64 policies
--   transcribed by a human is 64 chances to weaken one silently. The loop reads
--   each policy's CURRENT expression, wraps the call, and writes it back with
--   ALTER POLICY — which edits in place, so a policy is never dropped and there
--   is no instant where a table sits unprotected. Permissive/restrictive and the
--   role list are properties of the policy, not of the expression, so ALTER
--   cannot disturb them; that matters because the tier caps and the community
--   impersonation guards are RESTRICTIVE and combine with AND.
--
--   Idempotent: an already-wrapped policy renders as `( SELECT auth.uid() AS
--   uid)` and is skipped, so re-running this changes nothing.
--
-- ── PART B — app_sessions survived account deletion
--   Every other table with a user_id declares ON DELETE CASCADE to auth.users,
--   which is what makes `admin.deleteUser` actually erase a user. app_sessions
--   had no foreign key at all, so its rows would outlive the account they belong
--   to — a per-user identifier kept indefinitely after the user asked to be
--   deleted, which is not what the privacy policy promises.
--
--   Verified before writing this: 424 rows, ZERO orphans. Nobody has been
--   hard-deleted since the table was created, so the constraint validates
--   against the existing data as-is and this migration deletes nothing. Adding
--   it now is the difference between a promise and a mechanism.
--
--   NOT addressed here: the table's only policy is INSERT, so a user can write
--   session rows and cannot read their own. Whether they should be able to is a
--   product question, not a cleanup, and it is left alone deliberately.
--
-- ── PART C — 20 foreign keys with no covering index
--   Postgres does not index a foreign key for you. Without one, every DELETE on
--   the parent scans the whole child table to check for references, and every
--   join across that key is a sequential scan. Most of these are the payment and
--   import tables — precisely the ones that grow per transaction rather than per
--   client. Cheap now, and only ever more expensive later.
--
--   Note for whoever reads the advisor next: 39 OTHER indexes have never been
--   read even once. This migration does not touch them — dropping an index that
--   a rare query needs is a different risk from adding one — but the two facts
--   belong together: the indexing effort went to the wrong columns.
-- ════════════════════════════════════════════════════════════════


-- ── PART A ───────────────────────────────────────────────────────
DO $$
DECLARE
  r       record;
  clauses text;
  n       int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (    (qual       IS NOT NULL AND qual       LIKE '%auth.uid()%')
             OR (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%') )
       -- Already wrapped (renders as "( SELECT auth.uid() AS uid)") → skip.
       AND coalesce(qual, '')       NOT LIKE '%( SELECT auth.uid()%'
       AND coalesce(with_check, '') NOT LIKE '%( SELECT auth.uid()%'
     ORDER BY tablename, policyname
  LOOP
    clauses := '';
    -- USING only where a USING clause exists: an INSERT policy has no qual, and
    -- ALTER POLICY rejects the clause outright rather than ignoring it.
    IF r.qual IS NOT NULL THEN
      clauses := clauses || format(' USING (%s)',
        replace(r.qual, 'auth.uid()', '( SELECT auth.uid() )'));
    END IF;
    IF r.with_check IS NOT NULL THEN
      clauses := clauses || format(' WITH CHECK (%s)',
        replace(r.with_check, 'auth.uid()', '( SELECT auth.uid() )'));
    END IF;

    EXECUTE format('ALTER POLICY %I ON public.%I%s', r.policyname, r.tablename, clauses);
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'PART A: wrapped auth.uid() in % policies', n;
END $$;

-- Refuse to finish in a half-rewritten state.
DO $$
DECLARE leftover int;
BEGIN
  SELECT count(*) INTO leftover
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (    (qual       IS NOT NULL AND qual       LIKE '%auth.uid()%' AND qual       NOT LIKE '%( SELECT auth.uid()%')
           OR (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%( SELECT auth.uid()%') );
  IF leftover > 0 THEN
    RAISE EXCEPTION 'PART A incomplete: % policies still call auth.uid() per row', leftover;
  END IF;
END $$;


-- ── PART B ───────────────────────────────────────────────────────
ALTER TABLE public.app_sessions
  DROP CONSTRAINT IF EXISTS app_sessions_user_id_fkey;
ALTER TABLE public.app_sessions
  ADD CONSTRAINT app_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ── PART C ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_booking_pages_project                    ON public.booking_pages (project_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event                           ON public.bookings (event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_lead                            ON public.bookings (lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_meeting_type                    ON public.bookings (meeting_type_id);
CREATE INDEX IF NOT EXISTS idx_community_events_created_by              ON public.community_events (created_by);
CREATE INDEX IF NOT EXISTS idx_community_message_reports_reporter       ON public.community_message_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_actor            ON public.community_notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_message          ON public.community_notifications (message_id);
CREATE INDEX IF NOT EXISTS idx_goals_parent_goal                        ON public.goals (parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_transaction         ON public.payment_installments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_project                    ON public.payment_plans (project_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_client                  ON public.payment_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_installment             ON public.payment_requests (installment_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_transaction             ON public.payment_requests (transaction_id);
CREATE INDEX IF NOT EXISTS idx_pending_grow_imports_client              ON public.pending_grow_imports (client_id);
CREATE INDEX IF NOT EXISTS idx_pending_grow_imports_created_transaction ON public.pending_grow_imports (created_transaction_id);
CREATE INDEX IF NOT EXISTS idx_pending_invoice_imports_client           ON public.pending_invoice_imports (client_id);
CREATE INDEX IF NOT EXISTS idx_pending_invoice_imports_created_tx       ON public.pending_invoice_imports (created_transaction_id);
CREATE INDEX IF NOT EXISTS idx_reminders_category                       ON public.reminders (category_id);
CREATE INDEX IF NOT EXISTS idx_site_pages_project                       ON public.site_pages (project_id);


-- Verification (run after applying):
--   -- expect 0
--   SELECT count(*) FROM pg_policies WHERE schemaname='public'
--     AND ( (qual LIKE '%auth.uid()%'       AND qual       NOT LIKE '%( SELECT auth.uid()%')
--        OR (with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%( SELECT auth.uid()%') );
--   -- expect 1
--   SELECT count(*) FROM pg_constraint WHERE conname='app_sessions_user_id_fkey';
--   -- expect 79 policies, unchanged, and 8 of them still RESTRICTIVE
--   SELECT count(*), count(*) FILTER (WHERE permissive='RESTRICTIVE')
--     FROM pg_policies WHERE schemaname='public';
