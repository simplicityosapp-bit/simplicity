-- ════════════════════════════════════════════════════════════════
-- Migration 0073 — Grow external-charge import (Phase 4, part B)
-- Date: 2026-06-29
-- ════════════════════════════════════════════════════════════════
-- A scheduled poll (grow-poll) lists charges made through the coach's Grow
-- account — including ones NOT initiated from Simplicity (Grow dashboard,
-- POS, other links) — and STAGES them for the coach's approval (mirrors the
-- invoice Route-B import: never silently records income). Approving creates
-- an income transaction; the row is deduped by the Grow transaction id.
--
-- Three additive changes, all data-preserving:
--   1. user_integrations.grow_import_enabled — opt-in (default OFF), on the
--      coach's grow row. (Cursor reuses the existing last_polled_at column.)
--   2. transactions.grow_transaction_id — dedup tag. Set by grow-webhook on
--      payments we record AND on import-approve, so the poll never re-imports
--      a charge already in the books. Unique per user (partial index).
--   3. pending_grow_imports — staged external charges (browser READs its own;
--      writes via service-role edge fns only — same model as
--      pending_invoice_imports, migration 0035).
-- Re-running is a no-op (IF NOT EXISTS / guarded).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS grow_import_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS grow_transaction_id text;

-- One income row per Grow transaction id (dedup; ignores NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_grow_tx_uniq
  ON public.transactions (user_id, grow_transaction_id) WHERE grow_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pending_grow_imports (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grow_transaction_id    text NOT NULL,
  amount                 numeric,
  currency               text DEFAULT 'ILS',
  charge_date            date,
  customer_name          text,
  client_id              uuid REFERENCES clients(id) ON DELETE SET NULL,  -- best-effort match
  status                 text NOT NULL DEFAULT 'pending',
  created_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  raw                    jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_grow_imports_status_check CHECK (status IN ('pending', 'imported', 'dismissed')),
  -- One staged row per Grow charge (idempotent re-poll).
  CONSTRAINT pending_grow_imports_uniq UNIQUE (user_id, grow_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_grow_imports_user   ON pending_grow_imports (user_id);
CREATE INDEX IF NOT EXISTS idx_pending_grow_imports_status ON pending_grow_imports (status);

ALTER TABLE pending_grow_imports ENABLE ROW LEVEL SECURITY;
-- Browser READs its own staged imports (to render the prompt); inserts +
-- approve/dismiss happen via the service-role edge fns. SELECT-only policy.
DROP POLICY IF EXISTS pending_grow_imports_select ON pending_grow_imports;
CREATE POLICY pending_grow_imports_select ON pending_grow_imports
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_pending_grow_imports_updated ON pending_grow_imports;
CREATE TRIGGER trg_pending_grow_imports_updated BEFORE UPDATE ON pending_grow_imports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
