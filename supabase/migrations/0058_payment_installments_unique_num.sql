-- ════════════════════════════════════════════════════════════════
-- Migration 0058 — UNIQUE installment number per plan
-- Date: 2026-06-24
-- ════════════════════════════════════════════════════════════════
-- A plan's installments are inserted in one bulk call with num = 1..N
-- (usePaymentPlans.createPlan → insertPaymentInstallments). There was no DB
-- guard that (plan_id, num) is unique, so a retried insert against an
-- already-created plan could leave two "1/6", two "2/6", etc. — the same
-- duplicate-row class that migration 0028 closed for `transactions`.
--
-- A partial unique index (excluding soft-deleted rows) enforces it without
-- blocking the legitimate edit-then-soft-delete flow.
--
-- ⚠️ PRE-FLIGHT — run this first; it MUST return no rows. If it returns any,
--    de-dupe them before applying (the index creation will otherwise fail):
--      SELECT plan_id, num, count(*) FROM payment_installments
--      WHERE deleted_at IS NULL
--      GROUP BY plan_id, num HAVING count(*) > 1;
--
-- Idempotent (IF NOT EXISTS). Additive — no existing data is modified.
-- ════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_installments_plan_num
  ON payment_installments (plan_id, num)
  WHERE deleted_at IS NULL;
