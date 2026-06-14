-- ════════════════════════════════════════════════════════════════
-- Migration 0036 — Invoice dedup indexes (audit fixes)
-- Date: 2026-06-14
-- ════════════════════════════════════════════════════════════════
-- Two safety indexes surfaced by the audit:
--   1. webhook_token must be UNIQUE — it's the SOLE tenant authenticator
--      for the public webhook. Without a unique constraint a duplicate
--      would make the .maybeSingle() tenant lookup THROW, and the lookup
--      did a full table scan on every (incl. attacker) request. Partial
--      so the many NULLs (non-SUMIT rows) are allowed + not indexed.
--   2. One transaction per issued/imported document — backstops a
--      concurrent double-issue (Route A) or double-import (Route B) at
--      the DB level, independent of the app-level atomic claims.
-- Additive + idempotent.
-- ════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_integrations_webhook_token
  ON user_integrations (webhook_token) WHERE webhook_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_invoice_doc_uniq
  ON transactions (user_id, invoice_provider, invoice_document_id)
  WHERE invoice_document_id IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
