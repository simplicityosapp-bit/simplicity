-- ════════════════════════════════════════════════════════════════
-- Migration 0057 — DB-level CHECK on transactions.amount
-- Date: 2026-06-24
-- ════════════════════════════════════════════════════════════════
-- Until now the only guard on a transaction amount was the JS wrapper
-- assertValidAmount() (src/lib/api/transactions.js): it rejects NaN /
-- Infinity / negative / >1e12. But PostgREST + the anon key mean the UI is
-- NOT a trust boundary — a direct write with a valid session could still
-- insert a negative or absurd amount and poison finance aggregates, reports
-- and exports. This adds the same invariant at the DB level.
--
-- This matches the app's EXISTING convention exactly: expenses are stored as
-- POSITIVE amounts with type='expense' (finance.js sums by type, never by
-- sign), so amounts are always ≥ 0 — no legitimate row is affected.
--
-- ⚠️ PRE-FLIGHT — run this first; it MUST return 0. If it returns > 0, do NOT
--    apply this migration yet; investigate those rows together first:
--      SELECT count(*) FROM transactions WHERE amount < 0 OR amount > 1e12;
--
-- Idempotent (guarded on pg_constraint). DDL is transactional — if existing
-- data somehow violates the CHECK the ALTER fails and changes nothing.
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_amount_valid'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_amount_valid
      CHECK (amount >= 0 AND amount <= 1e12);
  END IF;
END $$;

COMMENT ON CONSTRAINT transactions_amount_valid ON transactions IS
  'Amount must be finite, non-negative and <= 1e12. Mirrors assertValidAmount() in src/lib/api/transactions.js. Expenses are positive + type=expense, so all amounts are >= 0.';
