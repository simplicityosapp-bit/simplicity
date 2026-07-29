-- ════════════════════════════════════════════════════════════════════════════
--  0103 — two bugs found reviewing 0100-0102 in their wider context.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. A reset left the reports showing the wiped account's numbers ─────────
-- resetAllUserData() ("erase everything and start from zero") SOFT-deletes
-- every row. Soft delete is a deliberate no-op for the ledger — that is what
-- keeps a completed task counted after it is tidied away — so report_tallies
-- survived the reset untouched and the reports screen kept showing the old
-- account. A reset that does not zero the reports is a broken promise on a
-- destructive action.
--
-- Deleting rather than rebuilding, on purpose: rebuilding from the surviving
-- rows would recount everything, because the contribution functions ignore
-- deleted_at by design. Zero is the honest answer.
--
-- Accepted limitation: restoring from the trash after a reset does not bring a
-- count back. Restore never re-increments anyway — the tally was never
-- decremented, so before/after contributions match and the delta is zero — the
-- reset only makes that visible.
CREATE OR REPLACE FUNCTION public.report_tallies_reset_own()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'report_tallies_reset_own requires an authenticated caller';
  END IF;
  DELETE FROM public.report_tallies WHERE user_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

COMMENT ON FUNCTION public.report_tallies_reset_own() IS
  'Clears the calling user''s report counters. Called by resetAllUserData(), which only soft-deletes rows and would otherwise leave the reports screen showing the wiped account''s numbers.';

REVOKE ALL ON FUNCTION public.report_tallies_reset_own() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_tallies_reset_own() TO authenticated;

-- ── 2. Importing an already-finished client invented a churn event ──────────
-- 0101's trigger stamped last_status_changed_at on INSERT as well as on a real
-- status change. onboardingImport creates clients directly as 'past' with a
-- session count carried from the file, so every already-finished client a coach
-- imported would have registered as an ENDING in the import month and inflated
-- "עזבו באמצע מסלול".
--
-- Nothing ended — the coach recorded someone who had already finished. A status
-- has only "last changed" once it changes. A caller may still pass an explicit
-- value on INSERT; this just stops inventing now() for a date nobody knows.
--
-- Caught before it bit: no client row had been created since 0101, so no tally
-- was polluted and no backfill is needed.
CREATE OR REPLACE FUNCTION public.clients_stamp_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status_meta IS DISTINCT FROM OLD.status_meta THEN
    NEW.last_status_changed_at := now();
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.clients_stamp_status_change() IS
  'Stamps clients.last_status_changed_at when status_meta actually changes. UPDATE only: stamping on INSERT made every imported already-past client look like an ending in the import month.';

-- ── 3. The nightly job would have destroyed the snapshots it protects ───────
-- THE WORST OF THE THREE, and invisible: nothing errors.
--
-- report_snapshot_month() OVERWROTE, and report_snapshot_backfill() called it
-- for EVERY closed month, nightly, immediately before the purge. Night 1 freezes
-- June correctly and deletes rows; night 2 recomputes June from rows that no
-- longer exist and overwrites the correct value with a lower one. The snapshot
-- layer would have eaten itself a day after it started working.
--
-- Not hypothetical: 5 rows in the beta data (3 clients, 2 tasks) already count
-- toward a frozen month and are queued for purge.
--
-- Freezing is now WRITE-ONCE. The nightly job fills only months with no value
-- yet; overwriting takes an explicit argument, for a deliberate rebuild while
-- the rows still exist.
--
-- ⚠️ Both functions gained a parameter, so CREATE OR REPLACE made OVERLOADS
-- rather than replacing them — leaving the old always-overwrite versions in
-- place and making report_snapshot_backfill() ambiguous, which would have
-- failed the cron command outright and taken the purge down with it. The old
-- signatures are dropped below; keep that in mind before adding another
-- default argument to either.

CREATE OR REPLACE FUNCTION public.report_snapshot_month(
  p_user uuid, p_period date, p_overwrite boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  eom timestamptz := ((p_period + interval '1 month')::timestamp AT TIME ZONE 'Asia/Jerusalem') - interval '1 microsecond';
  active_n int;
  open_n int;
BEGIN
  IF NOT p_overwrite AND EXISTS (
    SELECT 1 FROM public.report_tallies
    WHERE user_id = p_user AND period = p_period
      AND metric IN ('active_clients_at_end','open_tasks_at_end')
  ) THEN
    RETURN;                      -- already frozen; the rows may be gone by now
  END IF;

  SELECT count(*) INTO active_n FROM public.clients c
  WHERE c.user_id = p_user
    AND COALESCE(c.status_meta, c.status, 'no_status') = 'active'
    AND c.created_at IS NOT NULL AND c.created_at <= eom
    AND (c.deleted_at IS NULL OR c.deleted_at > eom);

  SELECT count(*) INTO open_n FROM public.tasks t
  WHERE t.user_id = p_user
    AND COALESCE(t.created_at, '-infinity'::timestamptz) <= eom
    AND (t.deleted_at IS NULL OR t.deleted_at > eom)
    AND (t.completed_at IS NULL OR t.completed_at > eom)
    AND NOT (t.completed_at IS NULL AND t.status = 'done');

  INSERT INTO public.report_tallies (user_id, period, metric, count)
  VALUES (p_user, p_period, 'active_clients_at_end', active_n)
  ON CONFLICT (user_id, period, metric) DO UPDATE SET count = EXCLUDED.count;

  INSERT INTO public.report_tallies (user_id, period, metric, count)
  VALUES (p_user, p_period, 'open_tasks_at_end', open_n)
  ON CONFLICT (user_id, period, metric) DO UPDATE SET count = EXCLUDED.count;
END $$;

CREATE OR REPLACE FUNCTION public.report_snapshot_backfill(p_overwrite boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
  this_month date := date_trunc('month', now() AT TIME ZONE 'Asia/Jerusalem')::date;
BEGIN
  FOR r IN
    SELECT u.user_id, generate_series(u.first_month, this_month - interval '1 month', interval '1 month')::date AS period
    FROM (
      SELECT user_id, date_trunc('month', min(created_at) AT TIME ZONE 'Asia/Jerusalem')::date AS first_month
      FROM (
        SELECT user_id, created_at FROM public.clients WHERE created_at IS NOT NULL
        UNION ALL
        SELECT user_id, created_at FROM public.tasks WHERE created_at IS NOT NULL
      ) src
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ) u
  LOOP
    PERFORM public.report_snapshot_month(r.user_id, r.period, p_overwrite);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

COMMENT ON FUNCTION public.report_snapshot_month(uuid, date, boolean) IS
  'Freeze the two "as of end of month" metrics for one user and one CLOSED month. WRITE-ONCE by default: a month that already has a value is left alone, because its rows may since have been purged and recomputing would lower it.';
COMMENT ON FUNCTION public.report_snapshot_backfill(boolean) IS
  'Freeze every closed month that has no value yet. Safe to run nightly - it will not recompute a month whose rows the purge has removed.';

DROP FUNCTION IF EXISTS public.report_snapshot_backfill();
DROP FUNCTION IF EXISTS public.report_snapshot_month(uuid, date);
