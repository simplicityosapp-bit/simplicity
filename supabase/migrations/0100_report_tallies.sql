-- ════════════════════════════════════════════════════════════════════════════
--  0100 — report_tallies: count the EVENT, not the surviving row.
-- ════════════════════════════════════════════════════════════════════════════
--  Reports currently recount the live tables on every render, so a number is
--  only as durable as its rows. That is why deleting a finished task shrank a
--  closed month (feedback acbbeaa5), and it is what blocks the 30-day purge:
--  hard-deleting a row would silently rewrite history.
--
--  This table breaks that link. Each counted event increments a per-month
--  counter AT THE MOMENT IT HAPPENS. Once counted, the number no longer
--  depends on the row existing, so a row can be purged without touching any
--  report.
--
--  WHY TRIGGERS, NOT APP CODE
--  Writes arrive from the web app, the Expo app, the import wizard, the
--  booking/lead intake edge functions, the meetings cron and SQL fixes. A
--  counter maintained in one client would silently miss the others. In the
--  database it cannot be bypassed.
--
--  THE ONE RULE THAT MATTERS
--  These triggers fire on INSERT and UPDATE only — never on DELETE. That is
--  deliberate and is the whole point: the purge must not decrement what it
--  removes. A consequence to know about: a genuinely mistaken hard delete
--  leaves its tally behind. The ledger records that the event happened, not
--  that the row survives. Account-level wipes must clear tallies explicitly
--  (user_id cascades, so dropping the auth user is already handled).
--
--  SOFT DELETE IS A NON-EVENT
--  No contribution below reads deleted_at, so an UPDATE that only sets it
--  produces identical before/after contributions and a delta of zero. Soft
--  delete, restore and purge all leave the counters untouched.
--
--  MONTHS ARE LOCAL, NOT UTC
--  getPeriodsForMonths() builds month bounds with new Date(y, m, 1) — local
--  time. Israel is UTC+2/+3, so a lead created 2026-06-30T23:00Z belongs to
--  JULY for the app and would land in June under a naive date_trunc. Every
--  timestamptz below is converted through Asia/Jerusalem (core's
--  DEFAULT_TIME_ZONE) first. leads.inquiry_date is already a local date and
--  is truncated as-is.
--
--  NOT INCLUDED
--  · Money (income/expense/net) — those deliberately exclude deleted rows, so
--    a purged transaction is already invisible to them and needs no tally.
--  · Snapshot metrics (activeClientsAtEnd, openTasksAtEnd) — "how many, as of
--    this date" cannot be derived from an event count. They keep reading live
--    rows and will degrade for purged periods; see the follow-up note in
--    docs/ before enabling the purge for clients/tasks.
-- ════════════════════════════════════════════════════════════════════════════

-- ── The ledger ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_tallies (
  user_id  uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period   date    NOT NULL,          -- first day of the month, Asia/Jerusalem
  metric   text    NOT NULL,
  count    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period, metric)
);

COMMENT ON TABLE public.report_tallies IS
  'Per-user, per-month event counters for the reports screen. Written by triggers at the moment an event happens so a number survives the deletion of the row that caused it (feedback acbbeaa5) and the 30-day purge. Triggers never fire on DELETE — see migration 0100.';

ALTER TABLE public.report_tallies ENABLE ROW LEVEL SECURITY;

-- Read-only to the user: every write goes through the SECURITY DEFINER bump
-- below, so a client cannot invent its own numbers.
DROP POLICY IF EXISTS report_tallies_select_own ON public.report_tallies;
CREATE POLICY report_tallies_select_own ON public.report_tallies
  FOR SELECT USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS report_tallies_user_period_idx
  ON public.report_tallies (user_id, period);

-- ── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_month(ts timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT date_trunc('month', ts AT TIME ZONE 'Asia/Jerusalem')::date;
$$;

COMMENT ON FUNCTION public.report_month(timestamptz) IS
  'Month bucket for a timestamp, in the app timezone. Must match getPeriodsForMonths(), which uses local-time month bounds.';

CREATE OR REPLACE FUNCTION public.report_bump(
  p_user uuid, p_period date, p_metric text, p_delta integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL OR p_period IS NULL OR p_delta = 0 THEN RETURN; END IF;
  INSERT INTO public.report_tallies AS t (user_id, period, metric, count)
  VALUES (p_user, p_period, p_metric, p_delta)
  ON CONFLICT (user_id, period, metric)
  DO UPDATE SET count = t.count + EXCLUDED.count;
END $$;

-- ── Contributions ───────────────────────────────────────────────────────────
-- One function per source table, returning every (period, metric) the row
-- currently contributes. The triggers diff OLD against NEW, so an edit that
-- moves a date moves the count with it.

CREATE OR REPLACE FUNCTION public.report_contrib_lead(l public.leads)
RETURNS TABLE(period date, metric text) LANGUAGE sql STABLE AS $$
  -- Inquiry month: the explicit date when set, else when the row appeared.
  SELECT date_trunc('month', l.inquiry_date)::date, 'new_inquiries'::text
    WHERE l.inquiry_date IS NOT NULL
  UNION ALL
  SELECT public.report_month(l.created_at), 'new_inquiries'::text
    WHERE l.inquiry_date IS NULL AND l.created_at IS NOT NULL
  UNION ALL
  SELECT public.report_month(l.closed_at), 'leads_closed'::text
    WHERE l.closed_at IS NOT NULL
  UNION ALL
  -- Mirrors isConvertedLead(): status_meta = 'converted' AND converted_at set.
  SELECT public.report_month(l.converted_at), 'leads_converted'::text
    WHERE l.status_meta = 'converted' AND l.converted_at IS NOT NULL
  UNION ALL
  -- Conversion rate is a COHORT ratio: of the leads that enquired in June,
  -- how many ever converted. So this one is filed under the INQUIRY month
  -- even when the conversion happens later.
  SELECT COALESCE(date_trunc('month', l.inquiry_date)::date, public.report_month(l.created_at)), 'cohort_converted'::text
    WHERE l.status_meta = 'converted' AND l.converted_at IS NOT NULL
      AND (l.inquiry_date IS NOT NULL OR l.created_at IS NOT NULL);
$$;

-- New clients only — deliberately NO churn branch.
--
-- computeReportForRange gates the client half of leftMidProcessPct on
-- c.last_status_changed_at. That column does not exist on clients; it exists
-- only on leads, and nothing has ever written it to a client. So the check is
-- permanently false and personal (non-group) clients have never reached that
-- metric — only group_members do. Writing the branch here would make the
-- tallies disagree with every number the app has shown to date.
--
-- Mirrored, not fixed, on purpose: correcting it changes a live business
-- figure and is the owner's call. If clients.last_status_changed_at is ever
-- added, this function and reports.ts have to change together.
CREATE OR REPLACE FUNCTION public.report_contrib_client(c public.clients)
RETURNS TABLE(period date, metric text) LANGUAGE sql STABLE AS $$
  SELECT public.report_month(c.created_at), 'new_clients'::text
    WHERE c.created_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.report_contrib_session(s public.sessions)
RETURNS TABLE(period date, metric text) LANGUAGE sql STABLE AS $$
  SELECT public.report_month(s.date), 'sessions_held'::text WHERE s.date IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.report_contrib_task(t public.tasks)
RETURNS TABLE(period date, metric text) LANGUAGE sql STABLE AS $$
  SELECT public.report_month(t.completed_at), 'tasks_completed'::text
    WHERE t.completed_at IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.report_contrib_member(m public.group_members)
RETURNS TABLE(period date, metric text) LANGUAGE sql STABLE AS $$
  SELECT public.report_month(m.left_at), 'ended_total'::text WHERE m.left_at IS NOT NULL
  UNION ALL
  SELECT public.report_month(m.left_at), 'ended_left_mid'::text
    WHERE m.left_at IS NOT NULL AND m.left_mid_process;
$$;

-- ── Trigger bodies ──────────────────────────────────────────────────────────
-- Each is the same shape: -1 for everything OLD contributed, +1 for everything
-- NEW contributes. Unchanged contributions cancel to zero, so an ordinary edit
-- (or a soft delete) writes nothing.

CREATE OR REPLACE FUNCTION public.report_sync_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR r IN SELECT * FROM public.report_contrib_lead(OLD) LOOP
      PERFORM public.report_bump(OLD.user_id, r.period, r.metric, -1);
    END LOOP;
  END IF;
  FOR r IN SELECT * FROM public.report_contrib_lead(NEW) LOOP
    PERFORM public.report_bump(NEW.user_id, r.period, r.metric, 1);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.report_sync_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR r IN SELECT * FROM public.report_contrib_client(OLD) LOOP
      PERFORM public.report_bump(OLD.user_id, r.period, r.metric, -1);
    END LOOP;
  END IF;
  FOR r IN SELECT * FROM public.report_contrib_client(NEW) LOOP
    PERFORM public.report_bump(NEW.user_id, r.period, r.metric, 1);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.report_sync_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR r IN SELECT * FROM public.report_contrib_session(OLD) LOOP
      PERFORM public.report_bump(OLD.user_id, r.period, r.metric, -1);
    END LOOP;
  END IF;
  FOR r IN SELECT * FROM public.report_contrib_session(NEW) LOOP
    PERFORM public.report_bump(NEW.user_id, r.period, r.metric, 1);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.report_sync_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR r IN SELECT * FROM public.report_contrib_task(OLD) LOOP
      PERFORM public.report_bump(OLD.user_id, r.period, r.metric, -1);
    END LOOP;
  END IF;
  FOR r IN SELECT * FROM public.report_contrib_task(NEW) LOOP
    PERFORM public.report_bump(NEW.user_id, r.period, r.metric, 1);
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.report_sync_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR r IN SELECT * FROM public.report_contrib_member(OLD) LOOP
      PERFORM public.report_bump(OLD.user_id, r.period, r.metric, -1);
    END LOOP;
  END IF;
  FOR r IN SELECT * FROM public.report_contrib_member(NEW) LOOP
    PERFORM public.report_bump(NEW.user_id, r.period, r.metric, 1);
  END LOOP;
  RETURN NULL;
END $$;

-- ── Wiring ──────────────────────────────────────────────────────────────────
-- AFTER INSERT OR UPDATE. No DELETE, on purpose — see the header.
DROP TRIGGER IF EXISTS trg_report_sync_lead ON public.leads;
CREATE TRIGGER trg_report_sync_lead
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.report_sync_lead();

DROP TRIGGER IF EXISTS trg_report_sync_client ON public.clients;
CREATE TRIGGER trg_report_sync_client
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.report_sync_client();

DROP TRIGGER IF EXISTS trg_report_sync_session ON public.sessions;
CREATE TRIGGER trg_report_sync_session
  AFTER INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.report_sync_session();

DROP TRIGGER IF EXISTS trg_report_sync_task ON public.tasks;
CREATE TRIGGER trg_report_sync_task
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.report_sync_task();

DROP TRIGGER IF EXISTS trg_report_sync_member ON public.group_members;
CREATE TRIGGER trg_report_sync_member
  AFTER INSERT OR UPDATE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.report_sync_member();

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Rebuilt from scratch so re-running the migration is safe and always lands on
-- the same numbers. Reads EVERY row including soft-deleted ones — that is the
-- history the reports engine counts today, and the tallies have to reproduce
-- it exactly or the switch-over would move numbers.
TRUNCATE public.report_tallies;

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
