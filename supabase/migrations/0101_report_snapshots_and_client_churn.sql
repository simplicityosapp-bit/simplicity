-- ════════════════════════════════════════════════════════════════════════════
--  0101 — the two blockers before the 30-day purge, plus the churn bug.
-- ════════════════════════════════════════════════════════════════════════════
--  0100 gave the FLOW metrics a ledger, so they survive a row being removed.
--  Three things still stood in the way of purging:
--
--  (1) SNAPSHOTS have no ledger. "Active clients at the end of June" is a
--      question about state on a date, not a count of events, so it cannot be
--      derived from a counter. Purging June's rows would shrink June.
--      → Materialise one value per closed month, into the same table. The
--        current month is never stored: it is still moving, and reports
--        compute it live.
--
--  (2) CLIENT CHURN never fired. computeReportForRange gates it on
--      c.last_status_changed_at, which does not exist on clients — only on
--      leads. So a personal (1-on-1) client who ended mid-process has never
--      reached "עזבו באמצע מסלול"; only group members did.
--      → Add the column and stamp it on a status change, the same way leads
--        already do. NOT backfilled: nothing records when a past client
--        became past, and inventing a date would fabricate history. So the
--        metric starts counting personal clients from today forward, and
--        every number the app has already shown stays exactly as it was.
--
--  (3) The drill-down lists rows and would come up short for a purged month.
--      Handled in the app, not here — the modal now says how many of the
--      counted records it can still show.
-- ════════════════════════════════════════════════════════════════════════════

-- ── (2) Client status timestamp ─────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_status_changed_at timestamptz;

COMMENT ON COLUMN public.clients.last_status_changed_at IS
  'When status_meta last changed. Mirrors leads.last_status_changed_at, which reports.ts already assumed existed here. Deliberately NULL for rows predating migration 0101: the real dates are unknown, so churn counts personal clients from that migration forward rather than inventing history.';

CREATE OR REPLACE FUNCTION public.clients_stamp_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only a genuine change of meta stamps. An edit that leaves the status
  -- alone must not look like a fresh ending.
  IF TG_OP = 'INSERT' THEN
    IF NEW.last_status_changed_at IS NULL THEN
      NEW.last_status_changed_at := now();
    END IF;
  ELSIF NEW.status_meta IS DISTINCT FROM OLD.status_meta THEN
    NEW.last_status_changed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clients_stamp_status ON public.clients;
CREATE TRIGGER trg_clients_stamp_status
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_stamp_status_change();

-- The ledger can now carry the client half of the churn ratio. Existing rows
-- have a NULL timestamp, so the rebuild below adds nothing for past months —
-- which is the point: no historical figure moves.
CREATE OR REPLACE FUNCTION public.report_contrib_client(c public.clients)
RETURNS TABLE(period date, metric text) LANGUAGE sql STABLE AS $$
  SELECT public.report_month(c.created_at), 'new_clients'::text
    WHERE c.created_at IS NOT NULL
  UNION ALL
  SELECT public.report_month(c.last_status_changed_at), 'ended_total'::text
    WHERE c.status_meta = 'past' AND COALESCE(c.sessions, 0) > 0
      AND c.last_status_changed_at IS NOT NULL
  UNION ALL
  SELECT public.report_month(c.last_status_changed_at), 'ended_left_mid'::text
    WHERE c.status_meta = 'past' AND COALESCE(c.sessions, 0) > 0
      AND c.last_status_changed_at IS NOT NULL AND c.left_mid_process;
$$;

-- ── (1) Snapshots ───────────────────────────────────────────────────────────
-- Same table as the counters, different meaning: these are a VALUE AT a date,
-- not a running total, so report_bump must never be pointed at them.
CREATE OR REPLACE FUNCTION public.report_snapshot_month(p_user uuid, p_period date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- Last instant of the month, in the app timezone, as a timestamptz.
  eom timestamptz := ((p_period + interval '1 month')::timestamp AT TIME ZONE 'Asia/Jerusalem') - interval '1 microsecond';
  active_n int;
  open_n int;
BEGIN
  -- Mirrors activeClientsAsOf(): current status assumed to have held since
  -- created_at, and a row counts only while it still existed.
  SELECT count(*) INTO active_n FROM public.clients c
  WHERE c.user_id = p_user
    AND COALESCE(c.status_meta, c.status, 'no_status') = 'active'
    AND c.created_at IS NOT NULL AND c.created_at <= eom
    AND (c.deleted_at IS NULL OR c.deleted_at > eom);

  -- Mirrors openTasksAsOf().
  SELECT count(*) INTO open_n FROM public.tasks t
  WHERE t.user_id = p_user
    AND COALESCE(t.created_at, '-infinity'::timestamptz) <= eom
    AND (t.deleted_at IS NULL OR t.deleted_at > eom)
    AND (t.completed_at IS NULL OR t.completed_at > eom)
    AND NOT (t.completed_at IS NULL AND t.status = 'done');

  INSERT INTO public.report_tallies AS r (user_id, period, metric, count)
  VALUES (p_user, p_period, 'active_clients_at_end', active_n)
  ON CONFLICT (user_id, period, metric) DO UPDATE SET count = EXCLUDED.count;

  INSERT INTO public.report_tallies AS r (user_id, period, metric, count)
  VALUES (p_user, p_period, 'open_tasks_at_end', open_n)
  ON CONFLICT (user_id, period, metric) DO UPDATE SET count = EXCLUDED.count;
END $$;

COMMENT ON FUNCTION public.report_snapshot_month(uuid, date) IS
  'Freeze the two "as of end of month" metrics for one user and one CLOSED month. Idempotent (overwrites, never accumulates). Call for the month that just ended, before its rows are purged.';

-- Every closed month a user has any history in. Called by the migration below
-- and, monthly, by the purge cron before it deletes anything.
CREATE OR REPLACE FUNCTION public.report_snapshot_backfill()
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
    PERFORM public.report_snapshot_month(r.user_id, r.period);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ── Rebuild + backfill ──────────────────────────────────────────────────────
-- Counters first (the client contribution changed shape), then snapshots.
DELETE FROM public.report_tallies
WHERE metric NOT IN ('active_clients_at_end', 'open_tasks_at_end');

INSERT INTO public.report_tallies (user_id, period, metric, count)
SELECT user_id, period, metric, count(*)::int FROM (
  SELECT l.user_id, c.period, c.metric
    FROM public.leads l, LATERAL public.report_contrib_lead(l) c
  UNION ALL
  SELECT cl.user_id, c.period, c.metric
    FROM public.clients cl, LATERAL public.report_contrib_client(cl) c
  UNION ALL
  SELECT s.user_id, c.period, c.metric
    FROM public.sessions s, LATERAL public.report_contrib_session(s) c
  UNION ALL
  SELECT t.user_id, c.period, c.metric
    FROM public.tasks t, LATERAL public.report_contrib_task(t) c
  UNION ALL
  SELECT m.user_id, c.period, c.metric
    FROM public.group_members m, LATERAL public.report_contrib_member(m) c
) x
WHERE user_id IS NOT NULL AND period IS NOT NULL
GROUP BY user_id, period, metric;

SELECT public.report_snapshot_backfill();
