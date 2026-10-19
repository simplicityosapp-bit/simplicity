-- ════════════════════════════════════════════════════════════════
-- 0118 — Simplicity is free for good: retire the plan-limit scaffolding.
-- ════════════════════════════════════════════════════════════════
-- 0075 built a paid-tier model that never went live: five RESTRICTIVE insert
-- policies (clients ≤10, goals ≤3, projects ≤2, one site page per kind, one
-- booking page), gated by the master switch billing_enforced() (always false)
-- and the helpers they call. With no paid plans, ever, the policies and the
-- helpers go.
--
-- Safe by construction: while billing_enforced() returned false every one of
-- these policies passed unconditionally, so dropping them changes no outcome
-- for any insert.
--
-- Dependencies checked against the live database on 2026-10-19 (pg_policies,
-- every public function body, every view): the eight functions below are
-- referenced ONLY by the five policies dropped first. No client code calls
-- them over RPC. The `invoices` edge function used to call billing_enforced()
-- and already treated a missing function as "billing off"; its current source
-- no longer calls it at all.
--
-- NOT touched: the user_subscriptions table, its rows and its policy. The
-- admin console still reads and writes it (manual subscribers, beta-exempt
-- dates); retiring it is a separate change.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS clients_tier_limit      ON clients;
DROP POLICY IF EXISTS goals_tier_limit        ON goals;
DROP POLICY IF EXISTS projects_tier_limit     ON projects;
DROP POLICY IF EXISTS site_pages_tier_gate    ON site_pages;
DROP POLICY IF EXISTS booking_pages_tier_gate ON booking_pages;

-- No CASCADE: if anything still depended on one of these, the drop must fail
-- loudly rather than take that thing with it.
DROP FUNCTION IF EXISTS public.billing_enforced();
DROP FUNCTION IF EXISTS public.current_tier();
DROP FUNCTION IF EXISTS public.client_count();
DROP FUNCTION IF EXISTS public.goal_count();
DROP FUNCTION IF EXISTS public.project_count();
DROP FUNCTION IF EXISTS public.site_page_count(text);
DROP FUNCTION IF EXISTS public.booking_page_count();
DROP FUNCTION IF EXISTS public.onboarding_completed();

NOTIFY pgrst, 'reload schema';
