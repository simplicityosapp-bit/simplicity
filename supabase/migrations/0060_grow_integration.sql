-- ════════════════════════════════════════════════════════════════
-- Migration 0060 — Grow (גרו / Meshulam) payment-gateway credentials
-- Date: 2026-06-24
-- ════════════════════════════════════════════════════════════════
-- Adds the ONE extra credential column the Grow payment gateway needs to
-- the EXISTING user_integrations table — the same service-role-only home
-- that already holds the Google Calendar OAuth tokens (migration 0018)
-- and the invoice-provider keys (migration 0033).
--
-- Grow authenticates every Light API request with THREE identifiers —
-- userId + pageCode + apiKey — one more than the invoice providers'
-- key+secret. So we add a single `page_code` column and reuse the
-- existing slots:
--     api_key     ← Grow userId    (the business identifier)
--     api_secret  ← Grow apiKey    (the sensitive key)
--     page_code   ← Grow pageCode  (NEW — this migration)
-- `environment` ('sandbox' | 'production') already exists (0033) and is
-- reused as-is — Grow HAS a real sandbox (sandbox.meshulam.co.il), unlike
-- the invoice providers (which are production-only).
--
-- SECURITY MODEL (unchanged — and the whole point):
--   user_integrations has RLS ENABLED with NO policy for the
--   `authenticated` role. The browser (anon key + a user session) can
--   NEVER read these rows — not even its own. Only the Edge Functions
--   (service-role key, bypasses RLS) read/write them. The UI learns
--   "connected? / which environment?" by calling the `grow` edge function
--   (action=status), never by reading this table.
--   → DO NOT add a client-facing policy to this table.
--
-- Additive + data-preserving: one nullable column, no DROP, no backfill.
-- Existing google_calendar / invoice rows are untouched (page_code NULL).
-- Re-running is a no-op (ADD COLUMN IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS page_code text;   -- Grow pageCode (payment-page config id); NULL for non-Grow rows

NOTIFY pgrst, 'reload schema';
