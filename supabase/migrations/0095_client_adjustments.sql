-- ════════════════════════════════════════════════════════════════
-- Migration 0095 — client_adjustments (התאמות ידניות עם סיבה ותאריך)
-- Date: 2026-07-20
-- ════════════════════════════════════════════════════════════════
-- A manual adjustment ("הנחה", "תיקון נתוני ייבוא", "תשלום שהתקבל ולא
-- נרשם") has lived as a bare number on the client row: clients.paid_adjustment
-- and clients.balance_adjustment. That number carries no date and no reason,
-- so the client file showed "סה״כ שולם ₪1,200" above a list of transactions
-- summing to ₪1,000 with nothing explaining the gap. Two months later nobody
-- can say where it came from.
--
-- This table gives every adjustment a date, a reason and an optional note.
--
-- IMPORTANT — the money math does NOT move here (owner decision 20/07):
--   clients.paid_adjustment / balance_adjustment REMAIN the source of truth
--   that clientBalance() reads. This table is the ledger that EXPLAINS them.
--   Every write updates the scalar and appends a row in the same operation.
--   Nothing about any existing client's balance changes on the day this runs.
--
-- Owner-only RLS, same pattern as payment_plans (migration 0056).
-- Additive + data-preserving: one new table, no existing column touched.
-- Re-running is a no-op (IF NOT EXISTS + a guarded backfill).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_adjustments (
  id          uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id     uuid NOT NULL,
  client_id   uuid NOT NULL,
  -- Which number this adjustment moves:
  --   'paid'    → clients.paid_adjustment    (raises «שולם»)
  --   'balance' → clients.balance_adjustment (lowers «יתרה», a forgiveness)
  kind        text NOT NULL,
  -- Why, in the user's own words. 'legacy' marks rows created by the backfill
  -- below, where the original reason was never captured.
  reason      text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  note        text,
  -- NULL only for backfilled 'legacy' rows — the real date is unknowable, and
  -- inventing one would be worse than showing none.
  occurred_on date DEFAULT CURRENT_DATE,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at  timestamp with time zone,
  CONSTRAINT client_adjustments_pkey PRIMARY KEY (id),
  CONSTRAINT client_adjustments_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT client_adjustments_client_id_fkey FOREIGN KEY (client_id)
    REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT client_adjustments_kind_check
    CHECK (kind IN ('paid', 'balance')),
  CONSTRAINT client_adjustments_reason_check
    CHECK (reason IN ('discount', 'import_fix', 'unrecorded_payment', 'legacy'))
);

CREATE INDEX IF NOT EXISTS idx_client_adjustments_user   ON public.client_adjustments (user_id);
CREATE INDEX IF NOT EXISTS idx_client_adjustments_client ON public.client_adjustments (client_id);

ALTER TABLE client_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_adjustments_own ON client_adjustments;
CREATE POLICY client_adjustments_own ON client_adjustments
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_client_adjustments_updated ON public.client_adjustments;
CREATE TRIGGER trg_client_adjustments_updated
  BEFORE UPDATE ON public.client_adjustments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE client_adjustments IS
  'Ledger EXPLAINING clients.paid_adjustment / balance_adjustment. Those columns stay the source of truth for clientBalance(); every write updates the scalar and appends a row here. reason=legacy marks rows backfilled by migration 0095, whose original date and reason are unknown.';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- One 'legacy' row per client that already carries a non-zero adjustment, so
-- the ledger reconciles with the scalar from the first day and the client file
-- never shows an unexplained gap. occurred_on stays NULL: the real date was
-- never recorded.
--
-- The guard is "this client+kind has NO adjustment row at all", not "no legacy
-- row". Guarding on legacy alone would re-fire for any client whose first
-- adjustment was made AFTER the migration: no legacy row exists, the scalar is
-- non-zero, and a re-run would insert a duplicate legacy row explaining money
-- twice. deleted_at IS NULL keeps soft-deleted clients out.

INSERT INTO client_adjustments (user_id, client_id, kind, reason, amount, occurred_on)
SELECT c.user_id, c.id, 'paid', 'legacy', c.paid_adjustment, NULL
FROM clients c
WHERE c.paid_adjustment IS NOT NULL
  AND c.paid_adjustment <> 0
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_adjustments a
    WHERE a.client_id = c.id AND a.kind = 'paid'
  );

INSERT INTO client_adjustments (user_id, client_id, kind, reason, amount, occurred_on)
SELECT c.user_id, c.id, 'balance', 'legacy', c.balance_adjustment, NULL
FROM clients c
WHERE c.balance_adjustment IS NOT NULL
  AND c.balance_adjustment <> 0
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_adjustments a
    WHERE a.client_id = c.id AND a.kind = 'balance'
  );
