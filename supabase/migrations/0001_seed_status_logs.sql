-- ============================================================
-- Migration 0001 — Seed initial status_log rows
-- Date: 2026-05-27
--
-- Background
--   client_status_log / lead_status_log are append-only audit tables
--   that capture every status transition. From 2026-05-27 onward the
--   React code writes a row on every insert/update. This migration
--   backfills an opening row for clients/leads that existed before
--   logging was wired, so trend graphs ("active clients over time",
--   "lead conversions over time") can reach back beyond today.
--
-- Idempotent
--   Re-running is a no-op: the NOT EXISTS clause skips rows that
--   already have at least one log entry.
-- ============================================================

-- Backfill clients: one opening row per client missing history.
INSERT INTO client_status_log (user_id, client_id, old_status, new_status, changed_at)
SELECT c.user_id, c.id, NULL, c.status_meta, c.created_at
FROM clients c
WHERE c.deleted_at IS NULL
  AND c.status_meta IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_status_log l WHERE l.client_id = c.id
  );

-- Backfill leads: only those with a non-null status_id (schema
-- constraint requires to_status_id NOT NULL). Leads with meta but
-- no sub-status stay unlogged — same limitation as the live writes.
INSERT INTO lead_status_log (user_id, lead_id, from_status_id, to_status_id, changed_at, source)
SELECT l.user_id, l.id, NULL, l.status_id, l.created_at, 'manual_select'
FROM leads l
WHERE l.deleted_at IS NULL
  AND l.status_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM lead_status_log lg WHERE lg.lead_id = l.id
  );
