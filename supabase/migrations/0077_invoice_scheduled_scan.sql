-- ════════════════════════════════════════════════════════════════
-- Migration 0077 — opt-in scheduled scan (Route B polling default OFF)
-- Date: 2026-06-30
-- ════════════════════════════════════════════════════════════════
-- Until now the invoice-poll cron scanned EVERY import-enabled connection
-- every 15 minutes, calling the provider's documents-list API around the
-- clock — which ran up real API charges on SUMIT/Green Invoice accounts
-- that bill per call. The real-time path (the SUMIT webhook) already stages
-- each new document with ONE API call per document, so the periodic scan is
-- redundant for connected webhooks and only useful as an opt-in safety net.
--
-- New column `scheduled_scan` (default FALSE) gates the periodic poll:
--   • auto_import  = the income-import switch (webhook stages docs in real
--     time when ON) — UNCHANGED.
--   • scheduled_scan = whether the (now daily) cron ALSO scans this
--     connection. OFF by default → webhook-only, no recurring API calls.
-- Existing connections are left at the default FALSE so nobody is silently
-- re-enrolled into polling; the user opts in from the connection card
-- (which shows the API-cost warning).
--
-- NOTE: the cron schedule itself is changed separately (operator runs
--   select cron.alter_job((select jobid from cron.job where jobname='invoice-poll'),
--                          schedule := '0 3 * * *');
-- so even an opted-in scan runs once a day, not every 15 minutes.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS scheduled_scan boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
