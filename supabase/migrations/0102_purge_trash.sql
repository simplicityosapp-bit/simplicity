-- ════════════════════════════════════════════════════════════════════════════
--  0102 — purge_trash(): permanently remove what the trash stopped showing.
-- ════════════════════════════════════════════════════════════════════════════
--  The trash lists items deleted in the last 30 days and offers restore. After
--  30 days an item drops off the list and can never be restored — but nothing
--  removed it, so it sat in the database forever and the guide claimed a
--  permanent deletion that never happened.
--
--  WHY THIS IS NOT "DELETE WHERE deleted_at < now() - 30 days"
--  Soft-deleted parents are still wired to LIVE children, and several of those
--  foreign keys are ON DELETE CASCADE:
--
--      clients  → sessions, group_members, payment_plans, client_adjustments
--      groups   → sessions, group_members
--      projects → groups
--
--  A naive sweep would destroy live rows. On the beta data (2026-07-29) it
--  would have taken out a live session belonging to a client deleted in June.
--  The rest are ON DELETE SET NULL, which silently mutates a live row instead
--  of deleting it — quieter, equally wrong.
--
--  THE RULE: a row is purged only when NOTHING LIVE still points at it.
--  Anything still referenced is skipped and reconsidered next run, so the
--  sweep converges as the children are themselves deleted. Applied uniformly
--  to CASCADE and SET NULL — the distinction is how the damage happens, not
--  whether it is acceptable.
--
--  THE GUARD IS GENERATED FROM pg_constraint, not hand-written. Writing the
--  EXISTS clauses by hand got three column names wrong on the first attempt
--  (pending_grow_imports.created_transaction_id, daily_answers
--  .user_question_id, and a missed projects→booking_pages edge). Reading the
--  catalog cannot make that mistake, and a foreign key added later is
--  respected without touching this file.
--
--  Pure log children (lead_status_log, client_status_log) are exempt: they
--  have no independent life, are invisible on their own, and belong to the row
--  being purged. Cascading them is correct.
--
--  ORDER: children before parents, so a parent freed by this run becomes
--  eligible on the NEXT one rather than being force-deleted now. Convergence
--  over cleverness.
--
--  REPORTS ARE ALREADY SAFE: flow metrics come from report_tallies (0100) and
--  the "as of" snapshots are frozen per closed month (0101). The caller must
--  still snapshot the month that just closed BEFORE purging — see
--  supabase/functions/purge-trash/index.ts, which does that first, always.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.purge_trash(boolean, integer);

CREATE OR REPLACE FUNCTION public.purge_trash_guard(p_table text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(string_agg(
    format('EXISTS (SELECT 1 FROM %I ch WHERE ch.%I = x.id%s)',
           child, child_col,
           CASE WHEN soft THEN ' AND ch.deleted_at IS NULL' ELSE '' END),
    ' OR '), '')
  FROM (
    SELECT c.conrelid::regclass::text AS child,
           (SELECT a.attname FROM unnest(c.conkey) k(att)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.att
            LIMIT 1) AS child_col,
           EXISTS (SELECT 1 FROM information_schema.columns ic
                    WHERE ic.table_schema='public'
                      AND ic.table_name = c.conrelid::regclass::text
                      AND ic.column_name='deleted_at') AS soft
    FROM pg_constraint c
    WHERE c.contype='f'
      AND c.confrelid::regclass::text = p_table
      AND c.conrelid::regclass::text NOT IN ('lead_status_log','client_status_log')
      AND c.conrelid <> c.confrelid          -- self-reference handled by ordering
  ) fks;
$$;

COMMENT ON FUNCTION public.purge_trash_guard(text) IS
  'Builds the "still referenced by something live" test for one table, straight from pg_constraint, so a foreign key added later is respected without editing this code.';

CREATE OR REPLACE FUNCTION public.purge_trash(
  p_dry_run boolean DEFAULT true,
  p_days    integer DEFAULT 30
)
RETURNS TABLE(table_name text, purged integer, skipped integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => p_days);
  tbl text;
  guard text;
  n_purge int;
  n_skip int;
  targets constant text[] := ARRAY[
    'group_members','client_adjustments','goal_entries','daily_answers',
    'reminders','user_quotes','site_pages','tasks','calendar_events',
    'payment_installments','payment_plans','sessions','transactions',
    'booking_pages','lead_pages','leads','clients',
    'lead_statuses','client_statuses','lead_sources','categories',
    'recurring_templates','groups','projects','goals','goal_categories',
    'user_questions','task_categories','task_statuses','meeting_types'
  ];
BEGIN
  FOREACH tbl IN ARRAY targets LOOP
    guard := public.purge_trash_guard(tbl);
    IF guard = '' THEN guard := 'false'; END IF;

    EXECUTE format(
      'SELECT count(*) FILTER (WHERE NOT (%s)), count(*) FILTER (WHERE %s)
         FROM %I x WHERE x.deleted_at IS NOT NULL AND x.deleted_at < %L',
      guard, guard, tbl, cutoff) INTO n_purge, n_skip;

    IF NOT p_dry_run AND n_purge > 0 THEN
      EXECUTE format(
        'DELETE FROM %I x WHERE x.deleted_at IS NOT NULL AND x.deleted_at < %L AND NOT (%s)',
        tbl, cutoff, guard);
    END IF;

    table_name := tbl; purged := n_purge; skipped := n_skip;
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.purge_trash(boolean, integer) IS
  'Permanently delete soft-deleted rows older than p_days, skipping any row still referenced by a LIVE row. Dry run by default: pass p_dry_run => false to delete. Snapshot the closed month first - report_snapshot_month().';

REVOKE ALL ON FUNCTION public.purge_trash(boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_trash_guard(text) FROM PUBLIC, anon, authenticated;
