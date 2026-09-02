-- ════════════════════════════════════════════════════════════════
--  schema.sql — the complete public schema, introspected from the LIVE database
--  Watermark: migration 0113.  Generated: 2026-09-01
--  Regenerate with:  node supabase/dump-schema.mjs --watermark <NNNN>
--
--  THIS FILE RUNS. It rebuilds an empty Postgres database into this schema —
--  that is what makes staging, CI and disaster recovery possible. Apply it with
--  `node supabase/run-schema.mjs` against a FRESH database. Never against
--  production: it creates, it does not migrate.
--
--  Statement order is dependency order, not reading order: functions precede the
--  policies and triggers that call them, every table precedes the foreign keys
--  that point at it. Sections are grouped by table inside that constraint.
--  `check_function_bodies` is off so a function body may reference a table that
--  is created further down — the same thing pg_dump does.
--
--  WHAT IS NOT HERE: no data, no roles, no auth.* / storage.* internals beyond
--  the one bucket and its policies, and no cron jobs — the cron commands carry
--  CRON_SECRET and POLL_SECRET in plain text and must not enter git (see L8).
--  Migration files present in the repo: 113. Which of them are actually
--  applied is documented in supabase/migrations/README.md — NOT in the database
--  history table, which is incomplete and is not the source of truth.
--
--  TWO THINGS THAT SILENTLY BREAK IF EDITED BY HAND:
--   1. Policies marked AS RESTRICTIVE combine with AND. The tier caps and the
--      community impersonation guards depend on it; recreating one as permissive
--      disables the cap without any error.
--   2. The PRIVILEGES section is load-bearing. Migration 0107 made function GRANTs
--      matter (three report RPCs were reachable by anon), and the community tables
--      deliberately withhold INSERT/UPDATE from `authenticated` so writes must go
--      through SECURITY DEFINER functions. A blanket GRANT ALL undoes both.
-- ════════════════════════════════════════════════════════════════

SET check_function_bodies = false;

-- ════════════════════════════════════════════════════════════════
--  EXTENSIONS
-- ════════════════════════════════════════════════════════════════
-- Some of these are provisioned by the Supabase platform; IF NOT EXISTS makes
-- the file safe to run on a project where they are already installed.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ════════════════════════════════════════════════════════════════
--  FUNCTIONS (36, full bodies)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.billing_enforced()
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ SELECT false $function$;

CREATE OR REPLACE FUNCTION public.booking_page_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM booking_pages WHERE user_id = auth.uid() AND deleted_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.client_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM clients WHERE user_id = auth.uid() AND deleted_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.clients_stamp_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status_meta IS DISTINCT FROM OLD.status_meta THEN
    NEW.last_status_changed_at := now();
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.community_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.community_notify_on_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE author_id uuid;
BEGIN
  SELECT user_id INTO author_id FROM public.community_messages WHERE id = NEW.message_id;
  IF NEW.mentioned_user_id IS DISTINCT FROM author_id THEN
    INSERT INTO public.community_notifications (recipient_id, actor_id, type, message_id)
    VALUES (NEW.mentioned_user_id, author_id, 'mention', NEW.message_id);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.community_profiles_guard_reserved_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service-role / migration: same standing RLS would give it
  END IF;

  IF is_reserved_display_name(NEW.display_name) THEN
    RAISE EXCEPTION 'display_name "%" is reserved and cannot be used', NEW.display_name
      USING ERRCODE = 'check_violation';   -- 23514 → PostgREST answers 400
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.current_tier()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT CASE
       WHEN s.beta_exempt_until IS NOT NULL AND s.beta_exempt_until > now() THEN 'premium'
       ELSE s.tier
     END
     FROM user_subscriptions s WHERE s.user_id = auth.uid()),
    'free'
  )
$function$;

CREATE OR REPLACE FUNCTION public.goal_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM goals WHERE user_id = auth.uid() AND deleted_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.guard_immutable_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  col      text;
  old_json jsonb;
  new_json jsonb;
BEGIN
  IF TG_LEVEL <> 'ROW' OR TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION
      'guard_immutable_columns must be a FOR EACH ROW / BEFORE UPDATE trigger (got % / % on %)',
      TG_LEVEL, TG_OP, TG_TABLE_NAME;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOREACH col IN ARRAY TG_ARGV LOOP
    IF NOT jsonb_exists(new_json, col) THEN
      RAISE EXCEPTION
        'guard_immutable_columns: table % has no column % (check the CREATE TRIGGER argument list)',
        TG_TABLE_NAME, col;
    END IF;

    IF old_json -> col IS DISTINCT FROM new_json -> col THEN
      RAISE EXCEPTION
        '%.% is immutable and cannot be changed by an update', TG_TABLE_NAME, col
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.is_community_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'simplicity.os.app@gmail.com'
$function$;

CREATE OR REPLACE FUNCTION public.is_reserved_display_name(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.community_reserved_names r
    WHERE CASE r.match_mode
      WHEN 'exact' THEN public.normalize_display_name(p_name) = public.normalize_display_name(r.pattern)
      ELSE public.normalize_display_name(p_name) LIKE '%' || public.normalize_display_name(r.pattern) || '%' END) $function$;

CREATE OR REPLACE FUNCTION public.normalize_display_name(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT regexp_replace(
           -- 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s  … plus l→i, which is not a leet
           -- mapping but a CONFUSABLE FOLD: i, l and 1 all land on 'i' so that
           -- name and pattern collapse together regardless of which the writer
           -- reached for.
           translate(lower(btrim(coalesce(p, ''))), '013457@$l', 'oieastasi'),
           -- Unchanged from 0084. \uXXXX escapes, never the literal characters:
           --   00AD soft hyphen · 200B ZWSP · 200C ZWNJ
           --   200D ZWJ         · 2060 word-joiner · FEFF BOM
           '[[:space:][:punct:]\u00AD\u200B\u200C\u200D\u2060\uFEFF]', '', 'g')
$function$;

CREATE OR REPLACE FUNCTION public.onboarding_completed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT (preferences #>> '{onboarding,completed_at}') IS NOT NULL
         OR (preferences #>> '{onboarding,skipped_at}')   IS NOT NULL
     FROM user_preferences WHERE user_id = auth.uid()),
    false
  )
$function$;

CREATE OR REPLACE FUNCTION public.project_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM projects WHERE user_id = auth.uid() AND deleted_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.purge_trash(p_dry_run boolean DEFAULT true, p_days integer DEFAULT 30)
 RETURNS TABLE(table_name text, purged integer, skipped integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cutoff timestamptz := now() - make_interval(days => p_days);
  tbl text;
  guard text;
  n_purge int;
  n_skip int;
  -- Children before parents, so a parent freed by this run becomes eligible
  -- on the NEXT one rather than being force-deleted now.
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
END $function$;

CREATE OR REPLACE FUNCTION public.purge_trash_guard(p_table text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.report_bump(p_user uuid, p_period date, p_metric text, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_user is null or p_period is null or p_delta = 0 then return; end if;
  insert into public.report_tallies as t (user_id, period, metric, count)
  values (p_user, p_period, p_metric, p_delta)
  on conflict (user_id, period, metric)
  do update set count = t.count + excluded.count;
end $function$;

CREATE OR REPLACE FUNCTION public.report_contrib_client(c clients)
 RETURNS TABLE(period date, metric text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.report_contrib_lead(l leads)
 RETURNS TABLE(period date, metric text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT date_trunc('month', l.inquiry_date)::date, 'new_inquiries'::text
    WHERE l.inquiry_date IS NOT NULL
  UNION ALL
  SELECT public.report_month(l.created_at), 'new_inquiries'::text
    WHERE l.inquiry_date IS NULL AND l.created_at IS NOT NULL
  UNION ALL
  SELECT public.report_month(l.closed_at), 'leads_closed'::text
    WHERE l.closed_at IS NOT NULL
  UNION ALL
  SELECT public.report_month(l.converted_at), 'leads_converted'::text
    WHERE l.status_meta = 'converted' AND l.converted_at IS NOT NULL
  UNION ALL
  SELECT COALESCE(date_trunc('month', l.inquiry_date)::date, public.report_month(l.created_at)), 'cohort_converted'::text
    WHERE l.status_meta = 'converted' AND l.converted_at IS NOT NULL
      AND (l.inquiry_date IS NOT NULL OR l.created_at IS NOT NULL);
$function$;

CREATE OR REPLACE FUNCTION public.report_contrib_member(m group_members)
 RETURNS TABLE(period date, metric text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT public.report_month(m.left_at), 'ended_total'::text WHERE m.left_at IS NOT NULL
  UNION ALL
  SELECT public.report_month(m.left_at), 'ended_left_mid'::text
    WHERE m.left_at IS NOT NULL AND m.left_mid_process;
$function$;

CREATE OR REPLACE FUNCTION public.report_contrib_session(s sessions)
 RETURNS TABLE(period date, metric text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT public.report_month(s.date), 'sessions_held'::text WHERE s.date IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.report_contrib_task(t tasks)
 RETURNS TABLE(period date, metric text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT public.report_month(t.completed_at), 'tasks_completed'::text
    WHERE t.completed_at IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.report_month(ts timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select date_trunc('month', ts at time zone 'Asia/Jerusalem')::date;
$function$;

CREATE OR REPLACE FUNCTION public.report_snapshot_backfill(p_overwrite boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_snapshot_month(p_user uuid, p_period date, p_overwrite boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_sync_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_sync_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_sync_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_sync_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_sync_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_tallies_reset_own()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'report_tallies_reset_own requires an authenticated caller';
  END IF;
  DELETE FROM public.report_tallies WHERE user_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.site_page_count(k text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM site_pages WHERE user_id = auth.uid() AND kind = k AND deleted_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION public.user_consent_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$function$;

-- ════════════════════════════════════════════════════════════════
--  TABLES (56) — columns, primary keys, unique and check constraints
-- ════════════════════════════════════════════════════════════════

-- ══ app_sessions ══════════════════════════════════════════
CREATE TABLE public.app_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_pkey PRIMARY KEY (id);

-- ══ booking_pages ═════════════════════════════════════════
CREATE TABLE public.booking_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT ''::text,
  published boolean NOT NULL DEFAULT false,
  auto_confirm boolean NOT NULL DEFAULT false,
  slug text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  meeting_type_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  write_to_google boolean NOT NULL DEFAULT false,
  invite_client boolean NOT NULL DEFAULT false,
  meeting_type_durations jsonb NOT NULL DEFAULT '{}'::jsonb,
  require_payment boolean NOT NULL DEFAULT false
);
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_slug_format CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));

-- ══ bookings ══════════════════════════════════════════════
CREATE TABLE public.bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  page_id uuid,
  user_id uuid NOT NULL,
  meeting_type_id uuid,
  name text NOT NULL,
  phone text,
  email text,
  note text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  lead_id uuid,
  event_id uuid,
  google_event_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payment_status text NOT NULL DEFAULT 'none'::text,
  payment_deadline timestamp with time zone
);
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_window_chk CHECK ((ends_at > starts_at));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE ((status = ANY (ARRAY['pending'::text, 'confirmed'::text])));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_status_chk CHECK ((payment_status = ANY (ARRAY['none'::text, 'awaiting'::text, 'paid'::text])));

-- ══ calendar_events ═══════════════════════════════════════
CREATE TABLE public.calendar_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  google_event_id text NOT NULL,
  client_id uuid,
  title text,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  all_day boolean NOT NULL DEFAULT false,
  duration_minutes integer,
  confidence_score real,
  matched_manually boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  project_id uuid,
  lead_id uuid,
  group_id uuid,
  owned boolean NOT NULL DEFAULT false
);
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_user_event_uniq UNIQUE (user_id, google_event_id);
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);

-- ══ categories ════════════════════════════════════════════
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

-- ══ client_adjustments ════════════════════════════════════
CREATE TABLE public.client_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  occurred_on date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_kind_check CHECK ((kind = ANY (ARRAY['paid'::text, 'balance'::text])));
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_reason_check CHECK ((reason = ANY (ARRAY['discount'::text, 'import_fix'::text, 'unrecorded_payment'::text, 'legacy'::text])));
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_kind_reason_check CHECK ((((reason = 'discount'::text) AND (kind = 'balance'::text)) OR ((reason = 'import_fix'::text) AND (kind = 'paid'::text)) OR ((reason = 'unrecorded_payment'::text) AND (kind = 'paid'::text)) OR (reason = 'legacy'::text)));
COMMENT ON TABLE public.client_adjustments IS 'Ledger EXPLAINING clients.paid_adjustment / balance_adjustment. Those columns stay the source of truth for clientBalance(); every write updates the scalar and appends a row here. reason=legacy marks rows backfilled by migration 0095, whose original date and reason are unknown.';

-- ══ client_status_log ═════════════════════════════════════
CREATE TABLE public.client_status_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_pkey PRIMARY KEY (id);
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_new_status_check CHECK ((new_status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_old_status_check CHECK ((old_status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));

-- ══ client_statuses ═══════════════════════════════════════
CREATE TABLE public.client_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_category text NOT NULL,
  display_name text NOT NULL,
  icon text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.client_statuses ADD CONSTRAINT client_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.client_statuses ADD CONSTRAINT client_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));

-- ══ clients ═══════════════════════════════════════════════
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  status_id uuid,
  status_meta text NOT NULL,
  project_id uuid,
  group_id uuid,
  sessions integer NOT NULL DEFAULT 0,
  price_per_session numeric NOT NULL DEFAULT 0,
  total_override numeric,
  has_custom_price boolean NOT NULL DEFAULT false,
  recurring_day smallint,
  recurring_time text,
  left_mid_process boolean NOT NULL DEFAULT false,
  phone text,
  notes text,
  notes_updated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  recurring_end_time text,
  recurring_start_date date,
  recurring_end_date date,
  balance_adjustment numeric NOT NULL DEFAULT 0,
  sessions_done_adjustment integer NOT NULL DEFAULT 0,
  paid_adjustment numeric NOT NULL DEFAULT 0,
  billing_mode text NOT NULL DEFAULT 'package'::text,
  email text,
  meeting_type_id uuid,
  price_overridden boolean NOT NULL DEFAULT false,
  status_overridden boolean NOT NULL DEFAULT false,
  address text,
  birth_date date,
  attention_snoozed_at timestamp with time zone,
  last_status_changed_at timestamp with time zone
);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_billing_mode_check CHECK ((billing_mode = ANY (ARRAY['package'::text, 'per_session'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_recurring_day_check CHECK (((recurring_day >= 0) AND (recurring_day <= 6)));
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_status_meta_check CHECK ((status_meta = ANY (ARRAY['active'::text, 'wandering'::text, 'past'::text, 'no_status'::text])));
COMMENT ON COLUMN public.clients.attention_snoozed_at IS 'When the coach last pressed "התעלם" on this client in the home attention widget. Read by clientsNeedingAttention() as a session-equivalent timestamp: the client resurfaces once this is older than the 45-day window. NULL = never dismissed.';
COMMENT ON COLUMN public.clients.last_status_changed_at IS 'When status_meta last changed. Mirrors leads.last_status_changed_at, which reports.ts already assumed existed here. Deliberately NULL for rows predating migration 0101: the real dates are unknown, so churn counts personal clients from that migration forward rather than inventing history.';

-- ══ community_events ══════════════════════════════════════
CREATE TABLE public.community_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  description text,
  location text,
  link text,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_events ADD CONSTRAINT community_events_title_check CHECK (((char_length(btrim(title)) > 0) AND (char_length(title) <= 140)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_description_check CHECK (((description IS NULL) OR (char_length(description) <= 1000)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_location_check CHECK (((location IS NULL) OR (char_length(location) <= 200)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_link_check CHECK (((link IS NULL) OR ((char_length(link) <= 300) AND (link ~* '^https?://'::text))));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_check CHECK (((ends_at IS NULL) OR (ends_at >= starts_at)));
ALTER TABLE public.community_events ADD CONSTRAINT community_events_pkey PRIMARY KEY (id);

-- ══ community_message_mentions ════════════════════════════
CREATE TABLE public.community_message_mentions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  mentioned_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_pkey PRIMARY KEY (id);
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_uniq UNIQUE (message_id, mentioned_user_id);

-- ══ community_message_reactions ═══════════════════════════
CREATE TABLE public.community_message_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_emoji_check CHECK (((char_length(btrim(emoji)) >= 1) AND (char_length(btrim(emoji)) <= 16)));
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_pkey PRIMARY KEY (id);
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_uniq UNIQUE (message_id, user_id, emoji);

-- ══ community_message_reports ═════════════════════════════
CREATE TABLE public.community_message_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_reason_check CHECK (((reason IS NULL) OR (char_length(reason) <= 500)));
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_uniq UNIQUE (message_id, reporter_id);

-- ══ community_messages ════════════════════════════════════
CREATE TABLE public.community_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  reply_to_id uuid,
  pinned_at timestamp with time zone
);
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_content_check CHECK ((char_length(btrim(content)) > 0));
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_pkey PRIMARY KEY (id);

-- ══ community_notifications ═══════════════════════════════
CREATE TABLE public.community_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  actor_id uuid,
  type text NOT NULL,
  message_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_type_check CHECK ((type = 'mention'::text));
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_pkey PRIMARY KEY (id);

-- ══ community_profiles ════════════════════════════════════
CREATE TABLE public.community_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_verified boolean NOT NULL DEFAULT false,
  bio text,
  headline text,
  specialties text[],
  link text
);
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_display_name_check CHECK ((char_length(btrim(display_name)) > 0));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_user_uniq UNIQUE (user_id);
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_bio_len CHECK (((bio IS NULL) OR (char_length(bio) <= 300)));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_headline_len CHECK (((headline IS NULL) OR (char_length(headline) <= 80)));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_specialties_bounds CHECK (((specialties IS NULL) OR ((COALESCE(array_length(specialties, 1), 0) <= 8) AND (char_length(array_to_string(specialties, ','::text)) <= 200))));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_link_shape CHECK (((link IS NULL) OR ((char_length(link) <= 200) AND (link ~* '^https?://'::text))));
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_display_name_len CHECK ((char_length(display_name) <= 60));

-- ══ community_reserved_names ══════════════════════════════
CREATE TABLE public.community_reserved_names (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  match_mode text NOT NULL DEFAULT 'contains'::text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_mode_chk CHECK ((match_mode = ANY (ARRAY['contains'::text, 'exact'::text])));
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_pattern_chk CHECK ((normalize_display_name(pattern) <> ''::text));
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_pkey PRIMARY KEY (id);
ALTER TABLE public.community_reserved_names ADD CONSTRAINT community_reserved_names_pattern_uniq UNIQUE (pattern);

-- ══ daily_answers ═════════════════════════════════════════
CREATE TABLE public.daily_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_question_id uuid NOT NULL,
  date date NOT NULL,
  value_num numeric,
  value_text text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_value_xor CHECK ((((value_num IS NOT NULL) AND (value_text IS NULL)) OR ((value_num IS NULL) AND (value_text IS NOT NULL))));

-- ══ feedback ══════════════════════════════════════════════
CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  type text,
  status text NOT NULL DEFAULT 'new'::text,
  platform text,
  source text NOT NULL DEFAULT 'app'::text,
  classification text,
  surface text,
  title text,
  notes text
);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_message_check CHECK ((char_length(btrim(message)) > 0));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_type_check CHECK (((type IS NULL) OR (type = ANY (ARRAY['bug'::text, 'idea'::text, 'praise'::text, 'other'::text]))));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'waiting_decision'::text, 'done'::text, 'rejected'::text])));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_platform_check CHECK (((platform IS NULL) OR (platform = ANY (ARRAY['mobile'::text, 'desktop'::text, 'both'::text, 'unknown'::text]))));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_source_check CHECK ((source = ANY (ARRAY['app'::text, 'email'::text, 'manual'::text])));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_classification_check CHECK (((classification IS NULL) OR (classification = ANY (ARRAY['bug'::text, 'dev'::text, 'unclear'::text]))));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_surface_check CHECK (((surface IS NULL) OR (surface = ANY (ARRAY['technical'::text, 'design'::text, 'both'::text]))));

-- ══ goal_categories ═══════════════════════════════════════
CREATE TABLE public.goal_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text,
  name text NOT NULL,
  icon text,
  color text,
  measurement_type text NOT NULL,
  data_source text,
  graph_type text NOT NULL,
  builtin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_graph_type_check CHECK ((graph_type = ANY (ARRAY['cumulative'::text, 'delta'::text])));
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_measurement_type_check CHECK ((measurement_type = ANY (ARRAY['auto'::text, 'manual'::text])));

-- ══ goal_entries ══════════════════════════════════════════
CREATE TABLE public.goal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL,
  project_id uuid,
  group_id uuid,
  date date NOT NULL,
  value numeric NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  goal_id uuid
);
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.goal_entries.goal_id IS 'The goal this progress belongs to. NULL = a legacy row written before 0110, which still scores against every goal in its category.';

-- ══ goals ═════════════════════════════════════════════════
CREATE TABLE public.goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL,
  parent_goal_id uuid,
  project_id uuid,
  group_id uuid,
  label text,
  time_frame text NOT NULL,
  target_value numeric NOT NULL,
  target_date date,
  importance integer NOT NULL,
  tracking_method text NOT NULL DEFAULT 'manual'::text,
  tracked_by_question_id uuid,
  measurement_type text,
  data_source text,
  manual_input_type text,
  schedule_pattern jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.goals ADD CONSTRAINT goals_pkey PRIMARY KEY (id);
ALTER TABLE public.goals ADD CONSTRAINT goals_importance_check CHECK (((importance >= 1) AND (importance <= 5)));
ALTER TABLE public.goals ADD CONSTRAINT goals_manual_input_type_check CHECK ((manual_input_type = ANY (ARRAY['number'::text, 'slider'::text, 'yes_no'::text])));
ALTER TABLE public.goals ADD CONSTRAINT goals_measurement_type_check CHECK ((measurement_type = ANY (ARRAY['auto'::text, 'manual'::text])));
ALTER TABLE public.goals ADD CONSTRAINT goals_time_frame_check CHECK ((time_frame = ANY (ARRAY['deadline'::text, 'monthly'::text, 'weekly'::text])));
ALTER TABLE public.goals ADD CONSTRAINT goals_tracking_method_check CHECK ((tracking_method = ANY (ARRAY['manual'::text, 'daily_question'::text])));

-- ══ group_members ═════════════════════════════════════════
CREATE TABLE public.group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  client_id uuid NOT NULL,
  joined_at timestamp with time zone NOT NULL,
  left_at timestamp with time zone,
  total_override numeric,
  has_custom_price boolean NOT NULL DEFAULT false,
  package_sessions_override integer,
  left_mid_process boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);

-- ══ groups ════════════════════════════════════════════════
CREATE TABLE public.groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  package_price numeric,
  package_sessions integer,
  recurring_day smallint,
  recurring_time text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  price_per_session numeric,
  billing_mode text NOT NULL DEFAULT 'package'::text,
  recurring_end_time text,
  recurring_start_date date,
  recurring_end_date date
);
ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE public.groups ADD CONSTRAINT groups_billing_mode_check CHECK ((billing_mode = ANY (ARRAY['package'::text, 'per_session'::text, 'none'::text])));
ALTER TABLE public.groups ADD CONSTRAINT groups_recurring_day_check CHECK (((recurring_day >= 0) AND (recurring_day <= 6)));
ALTER TABLE public.groups ADD CONSTRAINT groups_status_check CHECK ((status = ANY (ARRAY['active'::text, 'in_development'::text, 'ended'::text])));

-- ══ investments ═══════════════════════════════════════════
CREATE TABLE public.investments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  invested_on date NOT NULL DEFAULT CURRENT_DATE,
  transaction_id uuid,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.investments ADD CONSTRAINT investments_amount_check CHECK ((amount >= (0)::numeric));
ALTER TABLE public.investments ADD CONSTRAINT investments_pkey PRIMARY KEY (id);
COMMENT ON TABLE public.investments IS 'Record of money the user confirmed investing, for the finance screen''s investment-percentage widget. Each row normally links to the expense transaction it created (transaction_id, SET NULL on delete so the record survives). The widget excludes these transaction ids from its base so the target does not shrink itself month over month. Created by migration 0105.';

-- ══ landing_events ════════════════════════════════════════
CREATE TABLE public.landing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,
  session_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_events ADD CONSTRAINT landing_events_pkey PRIMARY KEY (id);
ALTER TABLE public.landing_events ADD CONSTRAINT landing_events_type_check CHECK ((type = ANY (ARRAY['view'::text, 'signup_start'::text, 'scroll_50'::text, 'scroll_75'::text, 'scroll_100'::text, 'faq_open'::text, 'engaged'::text])));

-- ══ lead_pages ════════════════════════════════════════════
CREATE TABLE public.lead_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT ''::text,
  published boolean NOT NULL DEFAULT false,
  auto_approve boolean NOT NULL DEFAULT false,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  project_id uuid,
  slug text
);
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_slug_format CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));

-- ══ lead_sources ══════════════════════════════════════════
CREATE TABLE public.lead_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_pkey PRIMARY KEY (id);

-- ══ lead_status_log ═══════════════════════════════════════
CREATE TABLE public.lead_status_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_status_id uuid,
  to_status_id uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL,
  source text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_source_check CHECK ((source = ANY (ARRAY['manual_drag'::text, 'manual_select'::text, 'converted'::text, 'auto_expire'::text])));

-- ══ lead_statuses ═════════════════════════════════════════
CREATE TABLE public.lead_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_category text NOT NULL,
  display_name text NOT NULL,
  color text,
  icon text,
  is_default boolean NOT NULL DEFAULT false,
  legacy_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  sort_order integer NOT NULL DEFAULT 0
);
ALTER TABLE public.lead_statuses ADD CONSTRAINT lead_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_statuses ADD CONSTRAINT lead_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['in_process'::text, 'converted'::text, 'not_relevant'::text])));

-- ══ leads ═════════════════════════════════════════════════
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  source_id uuid,
  status text NOT NULL DEFAULT 'new'::text,
  status_id uuid,
  status_meta text NOT NULL DEFAULT 'in_process'::text,
  inquiry_date date,
  follow_up_date date,
  last_status_changed_at timestamp with time zone,
  notes text,
  converted_to_client_id uuid,
  converted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  closed_at timestamp with time zone,
  project_id uuid,
  group_id uuid,
  page_id uuid,
  email text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_review boolean NOT NULL DEFAULT false
);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_contact'::text, 'intro_call'::text, 'pending_decision'::text, 'closed'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_status_meta_check CHECK ((status_meta = ANY (ARRAY['in_process'::text, 'converted'::text, 'not_relevant'::text])));

-- ══ meeting_types ═════════════════════════════════════════
CREATE TABLE public.meeting_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  default_price numeric,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  duration_minutes integer
);
ALTER TABLE public.meeting_types ADD CONSTRAINT meeting_types_pkey PRIMARY KEY (id);

-- ══ moon_snapshots ════════════════════════════════════════
CREATE TABLE public.moon_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  score numeric NOT NULL,
  paced numeric,
  confidence numeric,
  breakdown jsonb,
  reflection text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.moon_snapshots ADD CONSTRAINT moon_snapshots_user_date_uniq UNIQUE (user_id, date);
ALTER TABLE public.moon_snapshots ADD CONSTRAINT moon_snapshots_pkey PRIMARY KEY (id);

-- ══ payment_installments ══════════════════════════════════
CREATE TABLE public.payment_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  num integer NOT NULL,
  due_date date,
  amount numeric NOT NULL DEFAULT 0,
  received boolean NOT NULL DEFAULT false,
  received_date date,
  payment_method text,
  transaction_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_method_chk CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['bank_transfer'::text, 'cash'::text, 'credit_card'::text, 'app'::text, 'other'::text]))));
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_pkey PRIMARY KEY (id);

-- ══ payment_plans ═════════════════════════════════════════
CREATE TABLE public.payment_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  project_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  num_installments integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_pkey PRIMARY KEY (id);

-- ══ payment_requests ══════════════════════════════════════
CREATE TABLE public.payment_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  transaction_id uuid,
  installment_id uuid,
  booking_id uuid,
  source text NOT NULL,
  amount numeric NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending'::text,
  grow_process_id text,
  grow_process_token text,
  grow_transaction_id text,
  payment_url text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_source_check CHECK ((source = ANY (ARRAY['client'::text, 'transaction'::text, 'installment'::text, 'booking'::text])));
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'expired'::text, 'cancelled'::text, 'failed'::text])));
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_pkey PRIMARY KEY (id);

-- ══ pending_grow_imports ══════════════════════════════════
CREATE TABLE public.pending_grow_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  grow_transaction_id text NOT NULL,
  amount numeric,
  currency text DEFAULT 'ILS'::text,
  charge_date date,
  customer_name text,
  client_id uuid,
  status text NOT NULL DEFAULT 'pending'::text,
  created_transaction_id uuid,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'imported'::text, 'dismissed'::text])));
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_uniq UNIQUE (user_id, grow_transaction_id);

-- ══ pending_invoice_imports ═══════════════════════════════
CREATE TABLE public.pending_invoice_imports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  external_document_id text NOT NULL,
  document_type text,
  document_number text,
  amount numeric,
  currency text DEFAULT 'ILS'::text,
  doc_date date,
  customer_name text,
  document_url text,
  client_id uuid,
  status text NOT NULL DEFAULT 'pending'::text,
  created_transaction_id uuid,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'imported'::text, 'dismissed'::text])));
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_uniq UNIQUE (user_id, provider, external_document_id);

-- ══ projects ══════════════════════════════════════════════
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text
);
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])));
ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.projects.status IS 'Project lifecycle: active | ended. Filters the projects list; never cascades to the project''s clients (migration 0111).';

-- ══ quotes ════════════════════════════════════════════════
CREATE TABLE public.quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  text text NOT NULL,
  author text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  category text,
  text_male text,
  text_female text
);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);

-- ══ recurring_templates ═══════════════════════════════════
CREATE TABLE public.recurring_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  desc text,
  project_id uuid,
  client_id uuid,
  category_id uuid,
  cadence_type text NOT NULL DEFAULT 'monthly_date'::text,
  day_of_month integer,
  day_of_week smallint,
  until_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  trigger_type text NOT NULL DEFAULT 'schedule'::text
);
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_cadence_type_check CHECK ((cadence_type = ANY (ARRAY['monthly_date'::text, 'weekly'::text])));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 31)));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['schedule'::text, 'on_meeting'::text])));
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));

-- ══ reminders ═════════════════════════════════════════════
CREATE TABLE public.reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  scheduled_at timestamp with time zone NOT NULL,
  recurrence_type text NOT NULL DEFAULT 'none'::text,
  recurrence_pattern jsonb,
  end_date date,
  linked_to_type text,
  linked_to_id text,
  status text NOT NULL DEFAULT 'pending'::text,
  type text,
  channel text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  category_id uuid
);
ALTER TABLE public.reminders ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);
ALTER TABLE public.reminders ADD CONSTRAINT reminders_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['none'::text, 'weekly'::text, 'monthly_date'::text, 'every_x_days'::text])));
ALTER TABLE public.reminders ADD CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'triggered'::text, 'completed'::text, 'dismissed'::text, 'snoozed'::text])));
ALTER TABLE public.reminders ADD CONSTRAINT reminders_linked_to_type_check CHECK ((linked_to_type = ANY (ARRAY['client'::text, 'project'::text, 'group'::text, 'task'::text, 'transaction'::text, 'lead'::text, 'period'::text, 'investment'::text])));

-- ══ report_tallies ════════════════════════════════════════
CREATE TABLE public.report_tallies (
  user_id uuid NOT NULL,
  period date NOT NULL,
  metric text NOT NULL,
  count integer NOT NULL DEFAULT 0
);
ALTER TABLE public.report_tallies ADD CONSTRAINT report_tallies_pkey PRIMARY KEY (user_id, period, metric);
COMMENT ON TABLE public.report_tallies IS 'Per-user, per-month event counters for the reports screen. Written by triggers at the moment an event happens so a number survives the deletion of the row that caused it (feedback acbbeaa5) and the 30-day purge. Triggers never fire on DELETE - see migration 0100.';

-- ══ scheduled_meetings ════════════════════════════════════
CREATE TABLE public.scheduled_meetings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  scheduled_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  session_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  duration_minutes integer
);
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_duration_check CHECK (((duration_minutes IS NULL) OR (duration_minutes > 0)));
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'skipped'::text, 'expired'::text])));
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_subject_type_check CHECK ((subject_type = ANY (ARRAY['client'::text, 'group'::text])));
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_pkey PRIMARY KEY (id);
COMMENT ON COLUMN public.scheduled_meetings.duration_minutes IS 'Length of this meeting in minutes. NULL = fall back to the subject''s recurring_end_time, then to the 60-minute default the day view assumes.';

-- ══ sessions ══════════════════════════════════════════════
CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  group_id uuid,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  date timestamp with time zone NOT NULL,
  notes text,
  summary text,
  num integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_subject_type_check CHECK ((subject_type = ANY (ARRAY['client'::text, 'group'::text])));
ALTER TABLE public.sessions ADD CONSTRAINT sessions_subject_xor CHECK ((((client_id IS NOT NULL) AND (group_id IS NULL)) OR ((client_id IS NULL) AND (group_id IS NOT NULL))));

-- ══ site_pages ════════════════════════════════════════════
CREATE TABLE public.site_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'landing'::text,
  title text NOT NULL DEFAULT ''::text,
  published boolean NOT NULL DEFAULT false,
  slug text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  published_snapshot jsonb
);
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_kind_chk CHECK ((kind = ANY (ARRAY['landing'::text, 'lead'::text, 'booking'::text])));
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_slug_format CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'::text)));

-- ══ task_categories ═══════════════════════════════════════
CREATE TABLE public.task_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.task_categories ADD CONSTRAINT task_categories_pkey PRIMARY KEY (id);

-- ══ task_statuses ═════════════════════════════════════════
CREATE TABLE public.task_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_category text NOT NULL,
  display_name text NOT NULL,
  icon text,
  color text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.task_statuses ADD CONSTRAINT task_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.task_statuses ADD CONSTRAINT task_statuses_meta_category_check CHECK ((meta_category = ANY (ARRAY['open'::text, 'done'::text])));

-- ══ tasks ═════════════════════════════════════════════════
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  priority text NOT NULL,
  status text NOT NULL DEFAULT 'todo'::text,
  project_id uuid,
  client_id uuid,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  status_id uuid,
  category_id uuid,
  due_at timestamp with time zone,
  description text
);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'done'::text])));

-- ══ transactions ══════════════════════════════════════════
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  desc text,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'confirmed'::text,
  project_id uuid,
  client_id uuid,
  category_id uuid,
  recurring_id uuid,
  orphaned_from jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  invoice_provider text,
  invoice_document_id text,
  invoice_document_number text,
  invoice_document_type text,
  invoice_document_url text,
  invoice_synced_at timestamp with time zone,
  invoice_credited_at timestamp with time zone,
  invoice_credit_document_id text,
  invoice_credit_document_number text,
  invoice_credit_document_url text,
  payment_method text,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  recipient_tax_id text,
  grow_transaction_id text,
  scheduled_meeting_id uuid
);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'pending'::text, 'skipped'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['bank_transfer'::text, 'cash'::text, 'credit_card'::text, 'app'::text, 'other'::text]))));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_valid CHECK (((amount >= (0)::numeric) AND (amount <= '1000000000000'::numeric)));
COMMENT ON COLUMN public.transactions.payment_method IS 'How the money moved: bank_transfer | cash | credit_card | app (Bit/PayBox) | other | NULL (not set). Same key set as lib/invoiceDocs.js PAY_METHODS.';

-- ══ user_consent ══════════════════════════════════════════
CREATE TABLE public.user_consent (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  version text,
  accepted boolean NOT NULL DEFAULT true,
  source text,
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_pkey PRIMARY KEY (id);
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_uniq UNIQUE (user_id, kind, accepted_at);
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_kind_check CHECK ((kind = ANY (ARRAY['privacy'::text, 'dpa'::text, 'marketing'::text, 'terms'::text, 'cookies'::text])));

-- ══ user_integrations ═════════════════════════════════════
CREATE TABLE public.user_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'google_calendar'::text,
  access_token text,
  refresh_token text,
  token_expiry timestamp with time zone,
  sync_from date,
  sync_token text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  api_key text,
  api_secret text,
  environment text,
  auto_import boolean NOT NULL DEFAULT true,
  webhook_token text,
  last_polled_at timestamp with time zone,
  credentials_invalid_at timestamp with time zone,
  business_type text,
  page_code text,
  grow_auto_receipt boolean NOT NULL DEFAULT false,
  scheduled_scan boolean NOT NULL DEFAULT false,
  grow_import_enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_user_provider_uniq UNIQUE (user_id, provider);
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_pkey PRIMARY KEY (id);
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_environment_check CHECK (((environment IS NULL) OR (environment = ANY (ARRAY['sandbox'::text, 'production'::text]))));
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_business_type_check CHECK (((business_type IS NULL) OR (business_type = ANY (ARRAY['exempt'::text, 'licensed'::text]))));

-- ══ user_preferences ══════════════════════════════════════
CREATE TABLE public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_uniq UNIQUE (user_id);
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);

-- ══ user_questions ════════════════════════════════════════
CREATE TABLE public.user_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_key text,
  custom_text text,
  scale_type text NOT NULL,
  icon text,
  active boolean NOT NULL DEFAULT true,
  order integer NOT NULL DEFAULT 0,
  schedule_pattern jsonb NOT NULL DEFAULT '{"type": "days_of_week", "values": [0, 1, 2, 3, 4, 5, 6]}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_scale_type_check CHECK ((scale_type = ANY (ARRAY['1-10'::text, 'yes_no'::text, 'free_text'::text])));
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_source_chk CHECK (((template_key IS NOT NULL) OR (custom_text IS NOT NULL)));

-- ══ user_quotes ═══════════════════════════════════════════
CREATE TABLE public.user_quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL,
  author text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);
ALTER TABLE public.user_quotes ADD CONSTRAINT user_quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.user_quotes ADD CONSTRAINT user_quotes_text_check CHECK ((char_length(btrim(text)) > 0));

-- ══ user_subscriptions ════════════════════════════════════
CREATE TABLE public.user_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier text NOT NULL DEFAULT 'free'::text,
  status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamp with time zone,
  beta_exempt_until timestamp with time zone,
  subscribed_at timestamp with time zone,
  locked_price numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_tier_chk CHECK ((tier = ANY (ARRAY['free'::text, 'basic'::text, 'premium'::text])));
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_user_uniq UNIQUE (user_id);

-- ════════════════════════════════════════════════════════════════
--  FOREIGN KEYS — after every table exists
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.booking_pages ADD CONSTRAINT booking_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_page_id_fkey FOREIGN KEY (page_id) REFERENCES booking_pages(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_meeting_type_id_fkey FOREIGN KEY (meeting_type_id) REFERENCES meeting_types(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_event_id_fkey FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD CONSTRAINT categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.client_adjustments ADD CONSTRAINT client_adjustments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_status_log ADD CONSTRAINT client_status_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.client_statuses ADD CONSTRAINT client_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_status_id_fkey FOREIGN KEY (status_id) REFERENCES client_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_meeting_type_id_fkey FOREIGN KEY (meeting_type_id) REFERENCES meeting_types(id) ON DELETE SET NULL;
ALTER TABLE public.community_events ADD CONSTRAINT community_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_mentions ADD CONSTRAINT community_message_mentions_mentioned_user_id_fkey FOREIGN KEY (mentioned_user_id) REFERENCES community_profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_reactions ADD CONSTRAINT community_message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
ALTER TABLE public.community_message_reports ADD CONSTRAINT community_message_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_requires_profile FOREIGN KEY (user_id) REFERENCES community_profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES community_messages(id) ON DELETE SET NULL;
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES community_profiles(user_id) ON DELETE SET NULL;
ALTER TABLE public.community_notifications ADD CONSTRAINT community_notifications_message_id_fkey FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE;
ALTER TABLE public.community_profiles ADD CONSTRAINT community_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_answers ADD CONSTRAINT daily_answers_user_question_id_fkey FOREIGN KEY (user_question_id) REFERENCES user_questions(id) ON DELETE CASCADE;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.goal_categories ADD CONSTRAINT goal_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD CONSTRAINT goals_category_id_fkey FOREIGN KEY (category_id) REFERENCES goal_categories(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD CONSTRAINT goals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD CONSTRAINT goals_parent_goal_id_fkey FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE CASCADE;
ALTER TABLE public.goals ADD CONSTRAINT goals_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD CONSTRAINT goals_tracked_by_question_id_fkey FOREIGN KEY (tracked_by_question_id) REFERENCES user_questions(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT groups_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.groups ADD CONSTRAINT groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.investments ADD CONSTRAINT investments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.investments ADD CONSTRAINT investments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.lead_pages ADD CONSTRAINT lead_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_from_status_id_fkey FOREIGN KEY (from_status_id) REFERENCES lead_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_to_status_id_fkey FOREIGN KEY (to_status_id) REFERENCES lead_statuses(id) ON DELETE CASCADE;
ALTER TABLE public.lead_status_log ADD CONSTRAINT lead_status_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.lead_statuses ADD CONSTRAINT lead_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD CONSTRAINT leads_converted_to_client_id_fkey FOREIGN KEY (converted_to_client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_id_fkey FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_id_fkey FOREIGN KEY (status_id) REFERENCES lead_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD CONSTRAINT leads_page_id_fkey FOREIGN KEY (page_id) REFERENCES lead_pages(id) ON DELETE SET NULL;
ALTER TABLE public.meeting_types ADD CONSTRAINT meeting_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.moon_snapshots ADD CONSTRAINT moon_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES payment_plans(id) ON DELETE CASCADE;
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES payment_installments(id) ON DELETE SET NULL;
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.pending_grow_imports ADD CONSTRAINT pending_grow_imports_created_transaction_id_fkey FOREIGN KEY (created_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.pending_invoice_imports ADD CONSTRAINT pending_invoice_imports_created_transaction_id_fkey FOREIGN KEY (created_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.recurring_templates ADD CONSTRAINT recurring_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reminders ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.reminders ADD CONSTRAINT reminders_category_id_fkey FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE public.report_tallies ADD CONSTRAINT report_tallies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.task_categories ADD CONSTRAINT task_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.task_statuses ADD CONSTRAINT task_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES task_categories(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_id_fkey FOREIGN KEY (status_id) REFERENCES task_statuses(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_recurring_id_fkey FOREIGN KEY (recurring_id) REFERENCES recurring_templates(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_consent ADD CONSTRAINT user_consent_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_integrations ADD CONSTRAINT user_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_questions ADD CONSTRAINT user_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_quotes ADD CONSTRAINT user_quotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES goal_categories(id) ON DELETE CASCADE;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public.goal_entries ADD CONSTRAINT goal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE public.scheduled_meetings ADD CONSTRAINT scheduled_meetings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════
--  INDEXES (172; constraint-backed indexes are created above)
-- ════════════════════════════════════════════════════════════════
CREATE INDEX app_sessions_created_at_idx ON public.app_sessions USING btree (created_at);
CREATE INDEX app_sessions_user_id_idx ON public.app_sessions USING btree (user_id);
CREATE INDEX idx_booking_pages_user ON public.booking_pages USING btree (user_id);
CREATE UNIQUE INDEX idx_booking_pages_slug_unique ON public.booking_pages USING btree (lower(slug)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_booking_pages_project ON public.booking_pages USING btree (project_id);
CREATE INDEX idx_bookings_user ON public.bookings USING btree (user_id);
CREATE INDEX idx_bookings_page ON public.bookings USING btree (page_id);
CREATE INDEX idx_bookings_user_starts ON public.bookings USING btree (user_id, starts_at);
CREATE INDEX idx_bookings_pending ON public.bookings USING btree (user_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_bookings_awaiting ON public.bookings USING btree (user_id, payment_deadline) WHERE ((status = 'pending'::text) AND (payment_status = 'awaiting'::text));
CREATE INDEX idx_bookings_event ON public.bookings USING btree (event_id);
CREATE INDEX idx_bookings_lead ON public.bookings USING btree (lead_id);
CREATE INDEX idx_bookings_meeting_type ON public.bookings USING btree (meeting_type_id);
CREATE INDEX idx_calendar_events_client ON public.calendar_events USING btree (client_id);
CREATE INDEX idx_calendar_events_group ON public.calendar_events USING btree (group_id);
CREATE INDEX idx_calendar_events_lead ON public.calendar_events USING btree (lead_id);
CREATE INDEX idx_calendar_events_project ON public.calendar_events USING btree (project_id);
CREATE INDEX idx_calendar_events_start ON public.calendar_events USING btree (start_time);
CREATE INDEX idx_calendar_events_user ON public.calendar_events USING btree (user_id);
CREATE INDEX idx_categories_user ON public.categories USING btree (user_id);
CREATE INDEX idx_client_adjustments_user ON public.client_adjustments USING btree (user_id);
CREATE INDEX idx_client_adjustments_client ON public.client_adjustments USING btree (client_id);
CREATE INDEX idx_client_status_log_client ON public.client_status_log USING btree (client_id);
CREATE INDEX idx_client_status_log_user ON public.client_status_log USING btree (user_id);
CREATE INDEX idx_client_status_log_user_changed ON public.client_status_log USING btree (user_id, changed_at);
CREATE INDEX idx_client_statuses_user ON public.client_statuses USING btree (user_id);
CREATE INDEX idx_clients_group ON public.clients USING btree (group_id);
CREATE INDEX idx_clients_project ON public.clients USING btree (project_id);
CREATE INDEX idx_clients_status ON public.clients USING btree (status);
CREATE INDEX idx_clients_user ON public.clients USING btree (user_id);
CREATE INDEX idx_clients_status_id ON public.clients USING btree (status_id);
CREATE INDEX idx_clients_meeting_type_id ON public.clients USING btree (meeting_type_id);
CREATE INDEX clients_attention_snoozed_at_idx ON public.clients USING btree (user_id, attention_snoozed_at) WHERE (attention_snoozed_at IS NOT NULL);
CREATE INDEX idx_community_events_starts ON public.community_events USING btree (starts_at);
CREATE INDEX idx_community_events_created_by ON public.community_events USING btree (created_by);
CREATE INDEX idx_community_mentions_user ON public.community_message_mentions USING btree (mentioned_user_id);
CREATE INDEX idx_community_reactions_user ON public.community_message_reactions USING btree (user_id);
CREATE INDEX idx_community_reports_message ON public.community_message_reports USING btree (message_id);
CREATE INDEX idx_community_message_reports_reporter ON public.community_message_reports USING btree (reporter_id);
CREATE INDEX idx_community_messages_created_at ON public.community_messages USING btree (created_at DESC);
CREATE INDEX idx_community_messages_user ON public.community_messages USING btree (user_id);
CREATE INDEX idx_community_messages_reply_to ON public.community_messages USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL);
CREATE INDEX idx_community_messages_pinned ON public.community_messages USING btree (pinned_at) WHERE ((pinned_at IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_community_notifications_recipient ON public.community_notifications USING btree (recipient_id, created_at DESC);
CREATE INDEX idx_community_notifications_actor ON public.community_notifications USING btree (actor_id);
CREATE INDEX idx_community_notifications_message ON public.community_notifications USING btree (message_id);
CREATE INDEX idx_daily_answers_date ON public.daily_answers USING btree (date);
CREATE INDEX idx_daily_answers_question ON public.daily_answers USING btree (user_question_id);
CREATE UNIQUE INDEX idx_daily_answers_uniq ON public.daily_answers USING btree (user_question_id, date) WHERE (deleted_at IS NULL);
CREATE INDEX idx_daily_answers_user ON public.daily_answers USING btree (user_id);
CREATE INDEX idx_feedback_created_at ON public.feedback USING btree (created_at DESC);
CREATE INDEX idx_feedback_status ON public.feedback USING btree (status);
CREATE INDEX idx_feedback_user ON public.feedback USING btree (user_id);
CREATE INDEX idx_feedback_classification ON public.feedback USING btree (classification);
CREATE INDEX idx_goal_categories_user ON public.goal_categories USING btree (user_id);
CREATE INDEX idx_goal_entries_category ON public.goal_entries USING btree (category_id);
CREATE INDEX idx_goal_entries_date ON public.goal_entries USING btree (date);
CREATE INDEX idx_goal_entries_goal ON public.goal_entries USING btree (goal_id);
CREATE INDEX idx_goal_entries_group ON public.goal_entries USING btree (group_id);
CREATE INDEX idx_goal_entries_project ON public.goal_entries USING btree (project_id);
CREATE INDEX idx_goal_entries_user ON public.goal_entries USING btree (user_id);
CREATE INDEX idx_goals_category ON public.goals USING btree (category_id);
CREATE INDEX idx_goals_group ON public.goals USING btree (group_id);
CREATE INDEX idx_goals_project ON public.goals USING btree (project_id);
CREATE INDEX idx_goals_user ON public.goals USING btree (user_id);
CREATE INDEX idx_goals_tracked_question ON public.goals USING btree (tracked_by_question_id);
CREATE INDEX idx_goals_parent_goal ON public.goals USING btree (parent_goal_id);
CREATE INDEX idx_group_members_client ON public.group_members USING btree (client_id);
CREATE INDEX idx_group_members_group ON public.group_members USING btree (group_id);
CREATE INDEX idx_group_members_user ON public.group_members USING btree (user_id);
CREATE INDEX idx_groups_project ON public.groups USING btree (project_id);
CREATE INDEX idx_groups_status ON public.groups USING btree (status);
CREATE INDEX idx_groups_user ON public.groups USING btree (user_id);
CREATE INDEX idx_investments_user ON public.investments USING btree (user_id);
CREATE INDEX idx_investments_transaction ON public.investments USING btree (transaction_id);
CREATE INDEX idx_landing_events_created ON public.landing_events USING btree (created_at);
CREATE INDEX idx_landing_events_type_created ON public.landing_events USING btree (type, created_at);
CREATE INDEX idx_lead_pages_user ON public.lead_pages USING btree (user_id);
CREATE INDEX idx_lead_pages_project ON public.lead_pages USING btree (project_id);
CREATE UNIQUE INDEX idx_lead_pages_slug_unique ON public.lead_pages USING btree (lower(slug)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_lead_sources_user ON public.lead_sources USING btree (user_id);
CREATE INDEX idx_lead_status_log_lead ON public.lead_status_log USING btree (lead_id);
CREATE INDEX idx_lead_status_log_user ON public.lead_status_log USING btree (user_id);
CREATE INDEX idx_lead_status_log_user_changed ON public.lead_status_log USING btree (user_id, changed_at);
CREATE INDEX idx_lead_status_log_from ON public.lead_status_log USING btree (from_status_id);
CREATE INDEX idx_lead_status_log_to ON public.lead_status_log USING btree (to_status_id);
CREATE INDEX idx_lead_statuses_user ON public.lead_statuses USING btree (user_id);
CREATE INDEX idx_leads_group ON public.leads USING btree (group_id);
CREATE INDEX idx_leads_project ON public.leads USING btree (project_id);
CREATE INDEX idx_leads_status ON public.leads USING btree (status);
CREATE INDEX idx_leads_status_meta ON public.leads USING btree (status_meta);
CREATE INDEX idx_leads_user ON public.leads USING btree (user_id);
CREATE INDEX idx_leads_status_id ON public.leads USING btree (status_id);
CREATE INDEX idx_leads_source ON public.leads USING btree (source_id);
CREATE INDEX idx_leads_converted ON public.leads USING btree (converted_to_client_id);
CREATE INDEX idx_leads_page ON public.leads USING btree (page_id);
CREATE INDEX idx_leads_pending_review ON public.leads USING btree (user_id) WHERE pending_review;
CREATE INDEX idx_meeting_types_user ON public.meeting_types USING btree (user_id);
CREATE INDEX idx_moon_snapshots_date ON public.moon_snapshots USING btree (date);
CREATE INDEX idx_moon_snapshots_user ON public.moon_snapshots USING btree (user_id);
CREATE INDEX idx_payment_installments_user ON public.payment_installments USING btree (user_id);
CREATE INDEX idx_payment_installments_plan ON public.payment_installments USING btree (plan_id);
CREATE UNIQUE INDEX idx_payment_installments_plan_num ON public.payment_installments USING btree (plan_id, num) WHERE (deleted_at IS NULL);
CREATE INDEX idx_payment_installments_transaction ON public.payment_installments USING btree (transaction_id);
CREATE INDEX idx_payment_plans_user ON public.payment_plans USING btree (user_id);
CREATE INDEX idx_payment_plans_client ON public.payment_plans USING btree (client_id);
CREATE INDEX idx_payment_plans_project ON public.payment_plans USING btree (project_id);
CREATE UNIQUE INDEX payment_requests_grow_tx_uniq ON public.payment_requests USING btree (user_id, grow_transaction_id) WHERE (grow_transaction_id IS NOT NULL);
CREATE INDEX payment_requests_user ON public.payment_requests USING btree (user_id);
CREATE INDEX payment_requests_client ON public.payment_requests USING btree (user_id, client_id);
CREATE INDEX idx_payment_requests_client ON public.payment_requests USING btree (client_id);
CREATE INDEX idx_payment_requests_installment ON public.payment_requests USING btree (installment_id);
CREATE INDEX idx_payment_requests_transaction ON public.payment_requests USING btree (transaction_id);
CREATE INDEX idx_pending_grow_imports_user ON public.pending_grow_imports USING btree (user_id);
CREATE INDEX idx_pending_grow_imports_status ON public.pending_grow_imports USING btree (status);
CREATE INDEX idx_pending_grow_imports_client ON public.pending_grow_imports USING btree (client_id);
CREATE INDEX idx_pending_grow_imports_created_transaction ON public.pending_grow_imports USING btree (created_transaction_id);
CREATE INDEX idx_pending_invoice_imports_user ON public.pending_invoice_imports USING btree (user_id);
CREATE INDEX idx_pending_invoice_imports_status ON public.pending_invoice_imports USING btree (status);
CREATE INDEX idx_pending_invoice_imports_client ON public.pending_invoice_imports USING btree (client_id);
CREATE INDEX idx_pending_invoice_imports_created_tx ON public.pending_invoice_imports USING btree (created_transaction_id);
CREATE INDEX idx_projects_user ON public.projects USING btree (user_id);
CREATE INDEX projects_user_status_idx ON public.projects USING btree (user_id, status) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_quotes_text_uniq ON public.quotes USING btree (text);
CREATE INDEX idx_recurring_templates_client ON public.recurring_templates USING btree (client_id);
CREATE INDEX idx_recurring_templates_project ON public.recurring_templates USING btree (project_id);
CREATE INDEX idx_recurring_templates_user ON public.recurring_templates USING btree (user_id);
CREATE INDEX idx_recurring_templates_category ON public.recurring_templates USING btree (category_id);
CREATE INDEX idx_reminders_linked ON public.reminders USING btree (linked_to_type, linked_to_id);
CREATE INDEX idx_reminders_status ON public.reminders USING btree (status);
CREATE INDEX idx_reminders_user ON public.reminders USING btree (user_id);
CREATE INDEX idx_reminders_category ON public.reminders USING btree (category_id);
CREATE INDEX report_tallies_user_period_idx ON public.report_tallies USING btree (user_id, period);
CREATE INDEX idx_scheduled_meetings_status ON public.scheduled_meetings USING btree (status);
CREATE INDEX idx_scheduled_meetings_subject ON public.scheduled_meetings USING btree (subject_type, subject_id);
CREATE INDEX idx_scheduled_meetings_user ON public.scheduled_meetings USING btree (user_id);
CREATE UNIQUE INDEX scheduled_meetings_no_dup ON public.scheduled_meetings USING btree (user_id, subject_type, subject_id, scheduled_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_scheduled_meetings_session ON public.scheduled_meetings USING btree (session_id);
CREATE INDEX idx_sessions_client ON public.sessions USING btree (client_id);
CREATE INDEX idx_sessions_date ON public.sessions USING btree (date);
CREATE INDEX idx_sessions_group ON public.sessions USING btree (group_id);
CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);
CREATE INDEX idx_site_pages_user ON public.site_pages USING btree (user_id);
CREATE UNIQUE INDEX idx_site_pages_kind_slug_unique ON public.site_pages USING btree (kind, lower(slug)) WHERE ((slug IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_site_pages_project ON public.site_pages USING btree (project_id);
CREATE INDEX idx_task_categories_user ON public.task_categories USING btree (user_id);
CREATE INDEX idx_task_statuses_user ON public.task_statuses USING btree (user_id);
CREATE INDEX idx_tasks_category_id ON public.tasks USING btree (category_id);
CREATE INDEX idx_tasks_client ON public.tasks USING btree (client_id);
CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);
CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX idx_tasks_status_id ON public.tasks USING btree (status_id);
CREATE INDEX idx_tasks_user ON public.tasks USING btree (user_id);
CREATE INDEX idx_tasks_user_due ON public.tasks USING btree (user_id, due_at) WHERE ((due_at IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_transactions_client ON public.transactions USING btree (client_id);
CREATE INDEX idx_transactions_date ON public.transactions USING btree (date);
CREATE INDEX idx_transactions_project ON public.transactions USING btree (project_id);
CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);
CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id);
CREATE INDEX idx_transactions_category ON public.transactions USING btree (category_id);
CREATE INDEX idx_transactions_recurring ON public.transactions USING btree (recurring_id);
CREATE UNIQUE INDEX idx_transactions_invoice_doc_uniq ON public.transactions USING btree (user_id, invoice_provider, invoice_document_id) WHERE ((invoice_document_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX transactions_grow_tx_uniq ON public.transactions USING btree (user_id, grow_transaction_id) WHERE (grow_transaction_id IS NOT NULL);
CREATE UNIQUE INDEX idx_transactions_recurring_slot ON public.transactions USING btree (user_id, recurring_id, date) WHERE ((recurring_id IS NOT NULL) AND (scheduled_meeting_id IS NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX idx_transactions_recurring_meeting ON public.transactions USING btree (user_id, recurring_id, scheduled_meeting_id) WHERE ((recurring_id IS NOT NULL) AND (scheduled_meeting_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_user_consent_user ON public.user_consent USING btree (user_id);
CREATE INDEX idx_user_integrations_user ON public.user_integrations USING btree (user_id);
CREATE UNIQUE INDEX idx_user_integrations_webhook_token ON public.user_integrations USING btree (webhook_token) WHERE (webhook_token IS NOT NULL);
CREATE INDEX idx_user_preferences_user ON public.user_preferences USING btree (user_id);
CREATE INDEX idx_user_questions_user ON public.user_questions USING btree (user_id);
CREATE INDEX idx_user_quotes_user ON public.user_quotes USING btree (user_id);
CREATE INDEX idx_user_subscriptions_user ON public.user_subscriptions USING btree (user_id);

-- ════════════════════════════════════════════════════════════════
--  TRIGGERS (50)
-- ════════════════════════════════════════════════════════════════
CREATE TRIGGER trg_booking_pages_updated BEFORE UPDATE ON public.booking_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_adjustments_updated BEFORE UPDATE ON public.client_adjustments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_client_statuses_updated BEFORE UPDATE ON public.client_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_report_sync_client AFTER INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION report_sync_client();
CREATE TRIGGER trg_clients_stamp_status BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION clients_stamp_status_change();
CREATE TRIGGER trg_community_notify_mention AFTER INSERT ON public.community_message_mentions FOR EACH ROW EXECUTE FUNCTION community_notify_on_mention();
CREATE TRIGGER trg_community_messages_immutable BEFORE UPDATE ON public.community_messages FOR EACH ROW EXECUTE FUNCTION guard_immutable_columns('id', 'user_id', 'content', 'created_at');
CREATE TRIGGER trg_community_profiles_reserved_name BEFORE UPDATE ON public.community_profiles FOR EACH ROW WHEN ((new.display_name IS DISTINCT FROM old.display_name)) EXECUTE FUNCTION community_profiles_guard_reserved_name();
CREATE TRIGGER trg_daily_answers_updated BEFORE UPDATE ON public.daily_answers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goal_categories_updated BEFORE UPDATE ON public.goal_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goal_entries_updated BEFORE UPDATE ON public.goal_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_group_members_updated BEFORE UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_report_sync_member AFTER INSERT OR UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION report_sync_member();
CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_investments_updated BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_pages_updated BEFORE UPDATE ON public.lead_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_sources_updated BEFORE UPDATE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_statuses_updated BEFORE UPDATE ON public.lead_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_report_sync_lead AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION report_sync_lead();
CREATE TRIGGER trg_meeting_types_updated BEFORE UPDATE ON public.meeting_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_moon_snapshots_updated BEFORE UPDATE ON public.moon_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_installments_updated BEFORE UPDATE ON public.payment_installments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payment_plans_updated BEFORE UPDATE ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pending_grow_imports_updated BEFORE UPDATE ON public.pending_grow_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pending_invoice_imports_updated BEFORE UPDATE ON public.pending_invoice_imports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recurring_templates_updated BEFORE UPDATE ON public.recurring_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reminders_updated BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_scheduled_meetings_updated BEFORE UPDATE ON public.scheduled_meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_report_sync_session AFTER INSERT OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION report_sync_session();
CREATE TRIGGER trg_site_pages_updated BEFORE UPDATE ON public.site_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_task_categories_updated BEFORE UPDATE ON public.task_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_task_statuses_updated BEFORE UPDATE ON public.task_statuses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_report_sync_task AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION report_sync_task();
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_consent_stamp BEFORE INSERT ON public.user_consent FOR EACH ROW EXECUTE FUNCTION user_consent_stamp();
CREATE TRIGGER trg_user_integrations_updated BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_preferences_updated BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_questions_updated BEFORE UPDATE ON public.user_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_quotes_updated BEFORE UPDATE ON public.user_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_subscriptions_updated BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (79 policies)
-- ════════════════════════════════════════════════════════════════

-- ══ app_sessions ══════════════════════════════════════════
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_sessions_insert_own ON public.app_sessions FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ booking_pages ═════════════════════════════════════════
ALTER TABLE public.booking_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY booking_pages_own ON public.booking_pages FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY booking_pages_tier_gate ON public.booking_pages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (booking_page_count() < 1)));

-- ══ bookings ══════════════════════════════════════════════
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_own ON public.bookings FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ calendar_events ═══════════════════════════════════════
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_own ON public.calendar_events FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ categories ════════════════════════════════════════════
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_own ON public.categories FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ client_adjustments ════════════════════════════════════
ALTER TABLE public.client_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_adjustments_own ON public.client_adjustments FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ client_status_log ═════════════════════════════════════
ALTER TABLE public.client_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_status_log_insert ON public.client_status_log FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY client_status_log_select ON public.client_status_log FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ client_statuses ═══════════════════════════════════════
ALTER TABLE public.client_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_statuses_own ON public.client_statuses FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ clients ═══════════════════════════════════════════════
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_own ON public.clients FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY clients_tier_limit ON public.clients AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (NOT onboarding_completed()) OR (client_count() < 10)));

-- ══ community_events ══════════════════════════════════════
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_events_delete ON public.community_events FOR DELETE TO authenticated
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR is_community_admin()));
CREATE POLICY community_events_insert_own ON public.community_events FOR INSERT TO authenticated
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND community_access()));
CREATE POLICY community_events_select ON public.community_events FOR SELECT TO authenticated
  USING ((community_access() OR (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY community_events_update ON public.community_events FOR UPDATE TO authenticated
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR is_community_admin()))
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR is_community_admin()));

-- ══ community_message_mentions ════════════════════════════
ALTER TABLE public.community_message_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_mentions_insert_author ON public.community_message_mentions FOR INSERT TO authenticated
  WITH CHECK ((community_access() AND (EXISTS ( SELECT 1
   FROM community_messages m
  WHERE ((m.id = community_message_mentions.message_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY community_mentions_select_members ON public.community_message_mentions FOR SELECT TO authenticated
  USING ((community_access() AND (EXISTS ( SELECT 1
   FROM community_messages m
  WHERE ((m.id = community_message_mentions.message_id) AND (m.deleted_at IS NULL))))));

-- ══ community_message_reactions ═══════════════════════════
ALTER TABLE public.community_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_reactions_delete_own ON public.community_message_reactions FOR DELETE TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY community_reactions_insert_own ON public.community_message_reactions FOR INSERT TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND community_access()));
CREATE POLICY community_reactions_select_members ON public.community_message_reactions FOR SELECT TO authenticated
  USING ((community_access() AND (EXISTS ( SELECT 1
   FROM community_messages m
  WHERE ((m.id = community_message_reactions.message_id) AND (m.deleted_at IS NULL))))));

-- ══ community_message_reports ═════════════════════════════
ALTER TABLE public.community_message_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_reports_delete_admin ON public.community_message_reports FOR DELETE TO authenticated
  USING (is_community_admin());
CREATE POLICY community_reports_insert_own ON public.community_message_reports FOR INSERT TO authenticated
  WITH CHECK (((reporter_id = ( SELECT auth.uid() AS uid)) AND community_access()));
CREATE POLICY community_reports_select_admin ON public.community_message_reports FOR SELECT TO authenticated
  USING (is_community_admin());

-- ══ community_messages ════════════════════════════════════
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_messages_admin_moderate ON public.community_messages FOR UPDATE TO authenticated
  USING (is_community_admin())
  WITH CHECK (is_community_admin());
CREATE POLICY community_messages_insert_live ON public.community_messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((deleted_at IS NULL));
CREATE POLICY community_messages_insert_members ON public.community_messages FOR INSERT TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND community_access()));
CREATE POLICY community_messages_select_members ON public.community_messages FOR SELECT TO authenticated
  USING ((community_access() AND (deleted_at IS NULL)));
CREATE POLICY community_messages_soft_delete_own ON public.community_messages FOR UPDATE TO authenticated
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NULL)))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NOT NULL)));

-- ══ community_notifications ═══════════════════════════════
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_notifications_select_own ON public.community_notifications FOR SELECT TO authenticated
  USING ((recipient_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY community_notifications_update_own ON public.community_notifications FOR UPDATE TO authenticated
  USING ((recipient_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((recipient_id = ( SELECT auth.uid() AS uid)));

-- ══ community_profiles ════════════════════════════════════
ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_profiles_insert_own ON public.community_profiles FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY community_profiles_name_not_reserved ON public.community_profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((NOT is_reserved_display_name(display_name)));
CREATE POLICY community_profiles_select_members ON public.community_profiles FOR SELECT TO authenticated
  USING ((community_access() OR (user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY community_profiles_unverified_insert ON public.community_profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((NOT is_verified));
CREATE POLICY community_profiles_update_own ON public.community_profiles FOR UPDATE TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ community_reserved_names ══════════════════════════════
ALTER TABLE public.community_reserved_names ENABLE ROW LEVEL SECURITY;

-- ══ daily_answers ═════════════════════════════════════════
ALTER TABLE public.daily_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_answers_own ON public.daily_answers FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ feedback ══════════════════════════════════════════════
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_insert ON public.feedback FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY feedback_select ON public.feedback FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ goal_categories ═══════════════════════════════════════
ALTER TABLE public.goal_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_categories_own ON public.goal_categories FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ goal_entries ══════════════════════════════════════════
ALTER TABLE public.goal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY goal_entries_own ON public.goal_entries FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ goals ═════════════════════════════════════════════════
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goals_own ON public.goals FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY goals_tier_limit ON public.goals AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (goal_count() < 3)));

-- ══ group_members ═════════════════════════════════════════
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY group_members_own ON public.group_members FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ groups ════════════════════════════════════════════════
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_own ON public.groups FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ investments ═══════════════════════════════════════════
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY investments_own ON public.investments FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ landing_events ════════════════════════════════════════
ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;

-- ══ lead_pages ════════════════════════════════════════════
ALTER TABLE public.lead_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_pages_own ON public.lead_pages FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ lead_sources ══════════════════════════════════════════
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_sources_own ON public.lead_sources FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ lead_status_log ═══════════════════════════════════════
ALTER TABLE public.lead_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_status_log_insert ON public.lead_status_log FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY lead_status_log_select ON public.lead_status_log FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ lead_statuses ═════════════════════════════════════════
ALTER TABLE public.lead_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_statuses_own ON public.lead_statuses FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ leads ═════════════════════════════════════════════════
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_own ON public.leads FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ meeting_types ═════════════════════════════════════════
ALTER TABLE public.meeting_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_types_own ON public.meeting_types FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ moon_snapshots ════════════════════════════════════════
ALTER TABLE public.moon_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY moon_snapshots_own ON public.moon_snapshots FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ payment_installments ══════════════════════════════════
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_installments_own ON public.payment_installments FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ payment_plans ═════════════════════════════════════════
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_plans_own ON public.payment_plans FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ payment_requests ══════════════════════════════════════
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_requests_select_own ON public.payment_requests FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ pending_grow_imports ══════════════════════════════════
ALTER TABLE public.pending_grow_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY pending_grow_imports_select ON public.pending_grow_imports FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ pending_invoice_imports ═══════════════════════════════
ALTER TABLE public.pending_invoice_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY pending_invoice_imports_select ON public.pending_invoice_imports FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ projects ══════════════════════════════════════════════
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_own ON public.projects FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY projects_tier_limit ON public.projects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (project_count() < 2)));

-- ══ quotes ════════════════════════════════════════════════
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotes_select ON public.quotes FOR SELECT TO authenticated
  USING (true);

-- ══ recurring_templates ═══════════════════════════════════
ALTER TABLE public.recurring_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_templates_own ON public.recurring_templates FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ reminders ═════════════════════════════════════════════
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminders_own ON public.reminders FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ report_tallies ════════════════════════════════════════
ALTER TABLE public.report_tallies ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_tallies_select_own ON public.report_tallies FOR SELECT TO public
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ scheduled_meetings ════════════════════════════════════
ALTER TABLE public.scheduled_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_meetings_own ON public.scheduled_meetings FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ sessions ══════════════════════════════════════════════
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_own ON public.sessions FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ site_pages ════════════════════════════════════════════
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_pages_own ON public.site_pages FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY site_pages_tier_gate ON public.site_pages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT billing_enforced()) OR (current_tier() <> 'free'::text) OR (site_page_count(kind) < 1)));

-- ══ task_categories ═══════════════════════════════════════
ALTER TABLE public.task_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_categories_own ON public.task_categories FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ task_statuses ═════════════════════════════════════════
ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_statuses_own ON public.task_statuses FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ tasks ═════════════════════════════════════════════════
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_own ON public.tasks FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ transactions ══════════════════════════════════════════
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_own ON public.transactions FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ user_consent ══════════════════════════════════════════
ALTER TABLE public.user_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_consent_insert ON public.user_consent FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_consent_select ON public.user_consent FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ user_integrations ═════════════════════════════════════
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- ══ user_preferences ══════════════════════════════════════
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_preferences_own ON public.user_preferences FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ user_questions ════════════════════════════════════════
ALTER TABLE public.user_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_questions_own ON public.user_questions FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ user_quotes ═══════════════════════════════════════════
ALTER TABLE public.user_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_quotes_own ON public.user_quotes FOR ALL TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- ══ user_subscriptions ════════════════════════════════════
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_subscriptions_select_own ON public.user_subscriptions FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- ════════════════════════════════════════════════════════════════
--  PRIVILEGES — see the header: this section is load-bearing
-- ════════════════════════════════════════════════════════════════

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON ALL TABLES IN SCHEMA public TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE INSERT, UPDATE ON public.community_events FROM authenticated;
REVOKE INSERT ON public.community_message_mentions FROM authenticated;
REVOKE INSERT ON public.community_message_reactions FROM authenticated;
REVOKE INSERT ON public.community_message_reports FROM authenticated;
REVOKE INSERT ON public.community_messages FROM authenticated;
REVOKE UPDATE ON public.community_notifications FROM authenticated;
REVOKE INSERT, UPDATE ON public.community_profiles FROM authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;

-- Function EXECUTE. Default Postgres grants EXECUTE to PUBLIC, so every
-- function is revoked first and then granted back only where it is held.
REVOKE ALL ON FUNCTION public.billing_enforced() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_enforced() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.booking_page_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_page_count() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_count() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.clients_stamp_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clients_stamp_status_change() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_access() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.community_notify_on_mention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_notify_on_mention() TO service_role;
REVOKE ALL ON FUNCTION public.community_profiles_guard_reserved_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_profiles_guard_reserved_name() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_tier() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_tier() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.goal_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.goal_count() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_immutable_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_immutable_columns() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_community_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_community_admin() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_reserved_display_name(p_name text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_reserved_display_name(p_name text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalize_display_name(p text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_display_name(p text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.onboarding_completed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_completed() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.project_count() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_count() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.purge_trash(p_dry_run boolean, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_trash(p_dry_run boolean, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION public.purge_trash_guard(p_table text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_trash_guard(p_table text) TO service_role;
REVOKE ALL ON FUNCTION public.report_bump(p_user uuid, p_period date, p_metric text, p_delta integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_bump(p_user uuid, p_period date, p_metric text, p_delta integer) TO service_role;
REVOKE ALL ON FUNCTION public.report_contrib_client(c clients) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_contrib_client(c clients) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_contrib_lead(l leads) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_contrib_lead(l leads) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_contrib_member(m group_members) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_contrib_member(m group_members) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_contrib_session(s sessions) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_contrib_session(s sessions) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_contrib_task(t tasks) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_contrib_task(t tasks) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_month(ts timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_month(ts timestamp with time zone) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.report_snapshot_backfill(p_overwrite boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_snapshot_backfill(p_overwrite boolean) TO service_role;
REVOKE ALL ON FUNCTION public.report_snapshot_month(p_user uuid, p_period date, p_overwrite boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_snapshot_month(p_user uuid, p_period date, p_overwrite boolean) TO service_role;
REVOKE ALL ON FUNCTION public.report_sync_client() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_sync_client() TO service_role;
REVOKE ALL ON FUNCTION public.report_sync_lead() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_sync_lead() TO service_role;
REVOKE ALL ON FUNCTION public.report_sync_member() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_sync_member() TO service_role;
REVOKE ALL ON FUNCTION public.report_sync_session() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_sync_session() TO service_role;
REVOKE ALL ON FUNCTION public.report_sync_task() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_sync_task() TO service_role;
REVOKE ALL ON FUNCTION public.report_tallies_reset_own() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_tallies_reset_own() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.site_page_count(k text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_page_count(k text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_consent_stamp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_consent_stamp() TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
--  STORAGE — buckets and their policies
-- ════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('page-assets', 'page-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY page_assets_owner_delete ON storage.objects FOR DELETE TO authenticated
  USING (((bucket_id = 'page-assets'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY page_assets_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'page-assets'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY page_assets_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'page-assets'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY page_assets_owner_update ON storage.objects FOR UPDATE TO authenticated
  USING (((bucket_id = 'page-assets'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  WITH CHECK (((bucket_id = 'page-assets'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ════════════════════════════════════════════════════════════════
--  REALTIME — publication membership and replica identity
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.community_message_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_notifications;
