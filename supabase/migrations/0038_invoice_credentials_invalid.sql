-- ════════════════════════════════════════════════════════════════
-- Migration 0038 — durable "credentials broken" marker
-- Date: 2026-06-15
-- ════════════════════════════════════════════════════════════════
-- When a provider rejects the stored key/secret (e.g. the user revoked or
-- rotated it in Green Invoice / SUMIT), the connection silently stops working
-- and the user only finds out the next time they try to issue. This column
-- records WHEN we last saw an invalid-credentials rejection so the UI can show
-- a persistent "reconnect" state. It is cleared the moment a call succeeds
-- (test / issue / catalog) or the user reconnects.
--
-- Additive + nullable (null = credentials are presumed fine). No data touched.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS credentials_invalid_at timestamptz;

NOTIFY pgrst, 'reload schema';
