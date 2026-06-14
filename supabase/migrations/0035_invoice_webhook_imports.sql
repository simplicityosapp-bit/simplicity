-- ════════════════════════════════════════════════════════════════
-- Migration 0035 — Invoice webhook imports (Route B, SUMIT first)
-- Date: 2026-06-14
-- ════════════════════════════════════════════════════════════════
-- Route B: a document created in the external service pushes a webhook
-- to Simplicity → we re-fetch it and stage a "pending import" the user
-- approves, which then becomes an income transaction.
--
-- SUMIT first: SUMIT's trigger payload carries NO company id and NO
-- signature, so each connection gets an unguessable `webhook_token`; the
-- public `invoice-webhook` function maps ?t=<token> → the user, then
-- re-fetches the document by EntityID (never trusts the body).
--
-- Two additive changes, both data-preserving:
--   1. user_integrations.webhook_token — per-connection secret (service-
--      role only, same model as the API key; no client RLS policy).
--   2. pending_invoice_imports — staged incoming documents. The browser
--      may READ its own rows (to show the "import?" prompt); inserts +
--      approve/dismiss happen via the edge functions (service role).
-- ════════════════════════════════════════════════════════════════

-- ── 1. Per-connection webhook secret ──────────────────────────────
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS webhook_token text; -- unguessable; identifies the tenant on the public webhook

-- ── 2. Staged incoming documents ──────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_invoice_imports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              text NOT NULL,
  external_document_id  text NOT NULL,            -- SUMIT EntityID / GI document id
  document_type         text,                     -- normalized: invoice_receipt | receipt | invoice
  document_number       text,
  amount                numeric,
  currency              text DEFAULT 'ILS',
  doc_date              date,
  customer_name         text,
  document_url          text,
  client_id             uuid REFERENCES clients(id) ON DELETE SET NULL, -- best-effort match
  status                text NOT NULL DEFAULT 'pending',
  created_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  raw                   jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_invoice_imports_status_check CHECK (status IN ('pending', 'imported', 'dismissed')),
  -- One staged row per source document (idempotent webhook re-delivery).
  CONSTRAINT pending_invoice_imports_uniq UNIQUE (user_id, provider, external_document_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_invoice_imports_user   ON pending_invoice_imports (user_id);
CREATE INDEX IF NOT EXISTS idx_pending_invoice_imports_status ON pending_invoice_imports (status);

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE pending_invoice_imports ENABLE ROW LEVEL SECURITY;
-- The browser may READ its own staged imports (to render the prompt). It
-- does NOT insert/update/delete — the webhook stages rows and the
-- `invoices` function approves/dismisses, both via the service role
-- (bypasses RLS). So there is intentionally only a SELECT policy.
DROP POLICY IF EXISTS pending_invoice_imports_select ON pending_invoice_imports;
CREATE POLICY pending_invoice_imports_select ON pending_invoice_imports
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_pending_invoice_imports_updated ON pending_invoice_imports;
CREATE TRIGGER trg_pending_invoice_imports_updated BEFORE UPDATE ON pending_invoice_imports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
