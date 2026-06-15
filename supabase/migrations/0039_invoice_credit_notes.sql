-- ════════════════════════════════════════════════════════════════
-- Migration 0039 — credit notes (זיכוי / ביטול)
-- Date: 2026-06-15
-- ════════════════════════════════════════════════════════════════
-- A credit note cancels/refunds a previously-issued invoice (you can't delete
-- a tax document — you offset it). When the user credits an income transaction
-- that already has an issued document, we:
--   • issue a credit document at the provider, and
--   • mark the ORIGINAL transaction as cancelled (credited): it stays in the
--     list with the document trail, but drops out of income totals.
--
-- `invoice_credited_at` is BOTH the link timestamp and the "exclude from income
-- totals" flag (financeQuery skips rows where it is set, unless includeCancelled).
-- All columns additive + nullable — no existing data touched.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS invoice_credited_at            timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_credit_document_id     text,
  ADD COLUMN IF NOT EXISTS invoice_credit_document_number text,
  ADD COLUMN IF NOT EXISTS invoice_credit_document_url    text;

NOTIFY pgrst, 'reload schema';
