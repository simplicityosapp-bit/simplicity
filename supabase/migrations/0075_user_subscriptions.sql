-- ════════════════════════════════════════════════════════════════
-- Migration 0075 — Subscription tiers (INFRASTRUCTURE ONLY, ENFORCEMENT OFF)
-- Date: 2026-06-29
-- ════════════════════════════════════════════════════════════════
-- Introduces the subscription model (free / basic / premium) + the
-- per-user beta-exemption, and the DB-level limit-enforcement scaffolding.
--
-- ⚠️  MASTER SWITCH IS OFF.  billing_enforced() returns FALSE, so every
--     RESTRICTIVE limit policy below passes unconditionally — NOBODY is
--     blocked, every user keeps full access to everything. This migration
--     only BUILDS the machinery. (Mirrors the GROW_ENABLED pattern.)
--
--     TO ACTIVATE LATER (one-line migration):
--       CREATE OR REPLACE FUNCTION billing_enforced() RETURNS boolean
--         LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
--     and flip BILLING_ENABLED = true in src/lib/subscription.js.
--
-- Source of truth = user_subscriptions (service-role write only, like
-- user_integrations). The app reads its own row (SELECT-own RLS). Stripe /
-- admin write via service-role. A MISSING row = 'free' (the default for
-- everyone). There is NO backfill — beta exemptions are granted per-user by an
-- admin (see section 5), so the owner decides who keeps access, not a migration.
--
-- Additive + data-preserving:
--   • one new table, no existing data touched.
--   • RESTRICTIVE policies ADD to (AND with) the existing *_own permissive
--     policies for INSERT only — SELECT/UPDATE/DELETE are unchanged.
--   No column or table is dropped or rewritten.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Table — one row per user, service-role write only ────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'free' | 'basic' | 'premium'
  tier                   text NOT NULL DEFAULT 'free',
  -- future Stripe lifecycle: 'active' | 'past_due' | 'canceled' | NULL
  status                 text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  -- NULL = no exemption. When in the future ⇒ user is treated as 'premium'.
  beta_exempt_until      timestamptz,
  -- Locked-in terms (price grandfathering): the moment the user took their
  -- CURRENT paid tier, and the monthly price (ILS) they locked in then. If the
  -- published prices change later, existing subscribers keep `locked_price`.
  -- NULL on free / never-subscribed. Re-captured when the tier changes; cleared
  -- when dropping to free. (A cancellation flow shows these before cancelling.)
  subscribed_at          timestamptz,
  locked_price           numeric,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_subscriptions_tier_chk CHECK (tier IN ('free', 'basic', 'premium')),
  -- exactly one row per user
  CONSTRAINT user_subscriptions_user_uniq UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions (user_id);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- The user may READ their own subscription (to render the plan UI). There is
-- intentionally NO insert/update/delete policy for `authenticated`: only the
-- service-role (Stripe webhook / admin edge fn) may write — tamper-proof,
-- exactly like user_integrations credentials.
DROP POLICY IF EXISTS user_subscriptions_select_own ON user_subscriptions;
CREATE POLICY user_subscriptions_select_own ON user_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_user_subscriptions_updated ON user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2) Master switch + effective-tier helper ────────────────────────────────
-- The single lever that turns enforcement on/off everywhere. OFF for now.
CREATE OR REPLACE FUNCTION billing_enforced()
  RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;

-- Effective tier for the CURRENT user: an active beta exemption ⇒ 'premium';
-- otherwise the stored tier; missing row ⇒ 'free'. SECURITY DEFINER so it can
-- be called from RLS policies without recursing into RLS. Takes NO argument and
-- derives the user from auth.uid() — so it can never be abused via RPC to read
-- another user's tier (auth.uid() reads the request JWT even under DEFINER).
CREATE OR REPLACE FUNCTION current_tier()
  RETURNS text LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE
       WHEN s.beta_exempt_until IS NOT NULL AND s.beta_exempt_until > now() THEN 'premium'
       ELSE s.tier
     END
     FROM user_subscriptions s WHERE s.user_id = auth.uid()),
    'free'
  )
$$;

-- ── 3) Count helpers (SECURITY DEFINER → bypass RLS, no policy recursion) ───
-- All count the CURRENT user (auth.uid()) — no uid argument, so they can't be
-- called via RPC to count another user's rows.
-- Goals / projects: a plain live-row count.
CREATE OR REPLACE FUNCTION goal_count()
  RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM goals WHERE user_id = auth.uid() AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION project_count()
  RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM projects WHERE user_id = auth.uid() AND deleted_at IS NULL
$$;

-- Builder pages — landing/lead share site_pages (count PER KIND); booking lives
-- in its own table. Free tier gets one of each kind.
CREATE OR REPLACE FUNCTION site_page_count(k text)
  RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM site_pages WHERE user_id = auth.uid() AND kind = k AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION booking_page_count()
  RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM booking_pages WHERE user_id = auth.uid() AND deleted_at IS NULL
$$;

-- Clients: a plain live-row count (ALL non-deleted clients in the system,
-- regardless of status). Simple and stable — mirrors goal_count/project_count.
CREATE OR REPLACE FUNCTION client_count()
  RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM clients WHERE user_id = auth.uid() AND deleted_at IS NULL
$$;

-- True once the user FINISHED or SKIPPED onboarding. While onboarding is still
-- in progress, client inserts are unlimited — so the initial bulk import isn't
-- capped (owner decision: import is free during onboarding only). The 10-client
-- limit applies only to clients added AFTER onboarding. Missing prefs row ⇒
-- treated as still onboarding (forgiving — never blocks an early first import).
CREATE OR REPLACE FUNCTION onboarding_completed()
  RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (preferences #>> '{onboarding,completed_at}') IS NOT NULL
         OR (preferences #>> '{onboarding,skipped_at}')   IS NOT NULL
     FROM user_preferences WHERE user_id = auth.uid()),
    false
  )
$$;

-- ── 4) RESTRICTIVE limit policies (INSERT only; AND with existing *_own) ────
-- Each reads: pass if enforcement off, OR the user is paid/exempt, OR still
-- under the free-tier limit. While billing_enforced()=false the first OR
-- branch short-circuits true → these are completely inert.

-- Clients: ≤10 total (all non-deleted clients in the system). EXEMPT while the
-- user is still onboarding, so the initial bulk import is never capped.
DROP POLICY IF EXISTS clients_tier_limit ON clients;
CREATE POLICY clients_tier_limit ON clients AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT billing_enforced()
    OR current_tier() <> 'free'
    OR NOT onboarding_completed()
    OR client_count() < 10
  );

-- Goals: ≤3.
DROP POLICY IF EXISTS goals_tier_limit ON goals;
CREATE POLICY goals_tier_limit ON goals AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT billing_enforced()
    OR current_tier() <> 'free'
    OR goal_count() < 3
  );

-- Projects: ≤2.
DROP POLICY IF EXISTS projects_tier_limit ON projects;
CREATE POLICY projects_tier_limit ON projects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT billing_enforced()
    OR current_tier() <> 'free'
    OR project_count() < 2
  );

-- Builder pages: free tier gets ONE of each kind. landing/lead are counted
-- per-kind in site_pages (the new row's `kind` column); booking is its own
-- table. The new row counts toward the limit only if there isn't already one.
DROP POLICY IF EXISTS site_pages_tier_gate ON site_pages;
CREATE POLICY site_pages_tier_gate ON site_pages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT billing_enforced()
    OR current_tier() <> 'free'
    OR site_page_count(kind) < 1
  );

DROP POLICY IF EXISTS booking_pages_tier_gate ON booking_pages;
CREATE POLICY booking_pages_tier_gate ON booking_pages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT billing_enforced()
    OR current_tier() <> 'free'
    OR booking_page_count() < 1
  );

-- ── 5) No backfill — exemptions are granted PER-USER by an admin ────────────
-- Deliberately NO mass-assignment of beta exemptions here: the owner decides
-- who gets an exemption and for how long, via Admin → users → מנוי → "פטור בטא
-- ל: N חודשים" (the service-role set_subscription action). Existing + new users
-- start with NO row ⇒ current_tier() = 'free'. A row is created on demand by
-- that admin action (beta exemption) or, later, by the Stripe webhook (paid).
-- ⚠️  ACTIVATION: grant exemptions to the beta users you want to keep BEFORE
-- flipping the master switch on — otherwise they drop to free immediately.

NOTIFY pgrst, 'reload schema';
