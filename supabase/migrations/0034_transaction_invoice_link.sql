-- ════════════════════════════════════════════════════════════════
-- Migration 0034 — Link issued invoices back to transactions (Route A)
-- Date: 2026-06-14
-- ════════════════════════════════════════════════════════════════
-- Stage 2: "הפק חשבונית" issues a real document at the connected provider
-- (Green Invoice / SUMIT) for an income transaction. We record what was
-- issued on the transaction itself, so the row can show the document
-- number + a direct link, and so we can prevent issuing twice.
--
-- All columns are non-secret (document id / number / url / type / provider /
-- timestamp) and live on the user's OWN transaction row — already protected
-- by the existing `transactions_own` RLS policy (user_id = auth.uid()).
-- Nothing here changes RLS.
--
-- Additive + data-preserving. Idempotent (ADD COLUMN IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS invoice_provider        text,        -- 'greeninvoice' | 'sumit' (which service issued it)
  ADD COLUMN IF NOT EXISTS invoice_document_id     text,        -- provider's internal document id (idempotency guard)
  ADD COLUMN IF NOT EXISTS invoice_document_number text,        -- human-facing document number (for display)
  ADD COLUMN IF NOT EXISTS invoice_document_type   text,        -- normalized type issued (e.g. 'invoice_receipt' | 'receipt' | 'invoice')
  ADD COLUMN IF NOT EXISTS invoice_document_url     text,        -- direct link to the document
  ADD COLUMN IF NOT EXISTS invoice_synced_at        timestamptz; -- when it was issued / linked

NOTIFY pgrst, 'reload schema';
