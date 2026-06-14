-- ════════════════════════════════════════════════════════════════
-- Migration 0037 — Route-B polling cursor (Green Invoice)
-- Date: 2026-06-14
-- ════════════════════════════════════════════════════════════════
-- Green Invoice has no documented "document created" webhook, so Route B
-- for GI is a scheduled POLL (the `invoice-poll` edge function). It needs
-- a per-connection cursor of how far it has scanned. Additive + nullable
-- (a null cursor means "first poll → look back a default window").
--
-- Scheduling is set up separately (pg_cron → net.http_post to the function
-- with the POLL_SECRET) — see the deploy notes; not in this migration
-- because it embeds a secret.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

NOTIFY pgrst, 'reload schema';
