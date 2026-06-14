-- ════════════════════════════════════════════════════════════════
-- Migration 0033 — Invoice provider credentials (Green Invoice / SUMIT)
-- Date: 2026-06-14
-- ════════════════════════════════════════════════════════════════
-- Adds per-user invoice-service credentials to the EXISTING
-- `user_integrations` table — the same service-role-only home that
-- already holds the Google Calendar OAuth tokens (migration 0018).
--
-- SECURITY MODEL (unchanged — and the whole point):
--   `user_integrations` has RLS ENABLED with NO policy for the
--   `authenticated` role. The browser (anon key + a user session) can
--   NEVER read these rows — not even its own. Only the Edge Functions
--   (service-role key, bypasses RLS) read/write them. The UI learns
--   "connected? / which environment?" by calling the `invoices` edge
--   function (action=status), never by reading this table.
--   → DO NOT add a client-facing policy to this table.
--
-- New rows use provider = 'greeninvoice' (later 'sumit'). The existing
-- 'google_calendar' rows are untouched: every new column is nullable
-- or carries a default. The short-lived JWT that Green Invoice mints
-- from id+secret is cached in the EXISTING access_token / token_expiry
-- columns (same pattern as the Google access token) — no new column.
--
-- Additive + data-preserving. Re-running is a no-op
-- (ADD COLUMN IF NOT EXISTS + guarded constraint).
-- ════════════════════════════════════════════════════════════════

-- ── New credential columns (all nullable / defaulted) ──────────────
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS api_key     text,   -- provider API key id (Green Invoice key id / SUMIT key)
  ADD COLUMN IF NOT EXISTS api_secret  text,   -- provider secret (Green Invoice); null for providers without one
  ADD COLUMN IF NOT EXISTS environment text,   -- 'sandbox' | 'production'  (null for google_calendar rows)
  ADD COLUMN IF NOT EXISTS auto_import boolean NOT NULL DEFAULT false; -- Stage 5: import without per-document confirmation

-- ── environment is one of two known values (or NULL for non-invoice
--    rows). Guarded in a DO block so the migration stays idempotent. ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_integrations_environment_check'
  ) THEN
    ALTER TABLE user_integrations
      ADD CONSTRAINT user_integrations_environment_check
      CHECK (environment IS NULL OR environment IN ('sandbox', 'production'));
  END IF;
END $$;

-- ── RLS: intentionally UNCHANGED. The table keeps RLS enabled with NO
--    `authenticated` policy — api_key / api_secret are service-role-only,
--    exactly like the Google tokens. (No policy statements on purpose.) ─

NOTIFY pgrst, 'reload schema';
