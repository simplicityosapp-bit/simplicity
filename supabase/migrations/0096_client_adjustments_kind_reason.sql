-- ════════════════════════════════════════════════════════════════
-- Migration 0096 — client_adjustments: the reason must match the kind
-- Date: 2026-07-20
-- ════════════════════════════════════════════════════════════════
-- 0095 validates `kind` and `reason` independently, so the database happily
-- accepts kind='balance' with reason='unrecorded_payment' — a pairing that
-- means nothing ("a payment arrived, so I reduced the debt without recording
-- that anyone paid") and that the UI can never produce. Today the mapping
-- lives only in client code (REASONS in AdjustmentModal), which holds exactly
-- as long as the web app is the only writer. It isn't going to be: the mobile
-- app writes these columns too, and scripts and hand-edits reach the table.
--
-- A row with an impossible pairing cannot be rendered honestly — the client
-- file would show a reason that contradicts the number it moved.
--
--   discount           → balance  (lowers what is owed; "paid" is untouched)
--   import_fix         → paid     (corrects a wrong imported figure)
--   unrecorded_payment → paid     (money in hand, deliberately not booked)
--   legacy             → EITHER   (0095's backfill writes it for both kinds)
--
-- The existing kind/reason checks are kept: this one subsumes them, but they
-- give a clearer error when the offending value is simply a typo.
--
-- Safe to re-run. Refuses to run — with an explanatory error rather than a
-- bare constraint violation — if any existing row would fail it.
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad
  FROM client_adjustments
  WHERE NOT (
    (reason = 'discount'           AND kind = 'balance')
    OR (reason = 'import_fix'         AND kind = 'paid')
    OR (reason = 'unrecorded_payment' AND kind = 'paid')
    OR (reason = 'legacy')
  );
  IF bad > 0 THEN
    RAISE EXCEPTION
      'client_adjustments holds % row(s) whose reason does not match their kind. Inspect them before adding this constraint: SELECT id, client_id, kind, reason, amount FROM client_adjustments WHERE NOT ((reason = ''discount'' AND kind = ''balance'') OR (reason IN (''import_fix'',''unrecorded_payment'') AND kind = ''paid'') OR reason = ''legacy'');', bad;
  END IF;
END $$;

ALTER TABLE client_adjustments
  DROP CONSTRAINT IF EXISTS client_adjustments_kind_reason_check;

ALTER TABLE client_adjustments
  ADD CONSTRAINT client_adjustments_kind_reason_check CHECK (
    (reason = 'discount'           AND kind = 'balance')
    OR (reason = 'import_fix'         AND kind = 'paid')
    OR (reason = 'unrecorded_payment' AND kind = 'paid')
    OR (reason = 'legacy')
  );

COMMENT ON CONSTRAINT client_adjustments_kind_reason_check ON client_adjustments IS
  'The reason determines which column the adjustment moves, so the two cannot disagree. discount→balance; import_fix/unrecorded_payment→paid; legacy→either (written by 0095''s backfill, where the original reason is unknown).';
