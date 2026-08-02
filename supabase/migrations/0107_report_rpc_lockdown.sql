-- ════════════════════════════════════════════════════════════════
-- 0107 — take the report engine's write RPCs off the public API.
-- ════════════════════════════════════════════════════════════════
-- Migrations 0100-0103 added the report-tallies engine. Every function in
-- `public` is exposed by PostgREST as /rest/v1/rpc/<name> and granted to
-- `anon` + `authenticated` by default, so these landed on the public API
-- without anyone choosing to put them there.
--
-- Verified against production with nothing but the ANON key (which ships in
-- the client bundle, so this is "anyone with a browser"):
--
--   POST /rest/v1/rpc/report_bump            → 204
--   POST /rest/v1/rpc/report_snapshot_month  → 409, and the 409 is a FOREIGN
--                                              KEY error on report_tallies —
--                                              i.e. it ran and tried to INSERT,
--                                              and only the fake user id in the
--                                              probe stopped it.
--
-- Both take the target user as a PARAMETER and are SECURITY DEFINER, so they
-- do not read auth.uid() at all. With a real user id that is an unauthenticated
-- cross-tenant write: inflate or zero another coach's report numbers, and via
-- report_snapshot_month(..., p_overwrite => true) overwrite a frozen monthly
-- snapshot — which migration 0101 deliberately made write-once.
--
-- Nothing in apps/web calls any of these. They are driven by TRIGGERS
-- (report_sync_*) and by the purge-trash edge function, which uses the service
-- role — and the service role bypasses grants, so revoking costs nothing.
-- Triggers likewise execute as the table owner, not via the caller's grants.
--
-- NOT touched: report_tallies_reset_own(), which the account screen does call
-- (lib/api/account.js) and which already has no `anon` grant — it derives its
-- own user from auth.uid() rather than taking one.
-- ════════════════════════════════════════════════════════════════

-- ⚠️ FROM PUBLIC, not just the two roles. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, so revoking from anon/authenticated alone
-- changes nothing — verified the hard way: after the first version of this
-- migration the anon probe still returned 204.

-- ── The three that accept a target user / overwrite flag ────────────────
REVOKE ALL ON FUNCTION public.report_bump(uuid, date, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_snapshot_month(uuid, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_snapshot_backfill(boolean) FROM PUBLIC, anon, authenticated;

-- ── Trigger functions: never meant to be called directly ────────────────
REVOKE ALL ON FUNCTION public.report_sync_client()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sync_lead()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sync_member()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sync_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sync_task()    FROM PUBLIC, anon, authenticated;

-- ── Pin search_path on the helpers that lack it (lint 0011) ─────────────
-- Not SECURITY DEFINER, so this is hardening rather than a hole: it stops a
-- caller-controlled search_path from resolving these to a different table.
ALTER FUNCTION public.clients_stamp_status_change()                  SET search_path = public;
ALTER FUNCTION public.report_month(timestamptz)                      SET search_path = public;
ALTER FUNCTION public.report_contrib_client(public.clients)          SET search_path = public;
ALTER FUNCTION public.report_contrib_lead(public.leads)              SET search_path = public;
ALTER FUNCTION public.report_contrib_member(public.group_members)    SET search_path = public;
ALTER FUNCTION public.report_contrib_session(public.sessions)        SET search_path = public;
ALTER FUNCTION public.report_contrib_task(public.tasks)              SET search_path = public;
