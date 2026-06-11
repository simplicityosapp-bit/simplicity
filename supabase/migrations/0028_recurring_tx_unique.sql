-- 0028_recurring_tx_unique.sql
-- Prevent DUPLICATE auto-generated recurring transactions. Two tabs / two
-- component mounts generating at once can each insert the same cadence slot
-- (neither sees the other's in-flight write). scheduled_meetings already has
-- this guard via UNIQUE(user_id, subject_type, subject_id, scheduled_at);
-- transactions never did. The generation engine already swallows the resulting
-- 23505 (useRecurringGeneration.js), so this surfaces no error — it just stops
-- the duplicate row from being written.

-- 1) Soft-delete existing duplicates first (keep one row per slot, lowest id)
--    so the unique index can be created on data that already has dupes.
UPDATE transactions t SET deleted_at = now()
WHERE t.recurring_id IS NOT NULL AND t.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM transactions o
    WHERE o.user_id = t.user_id AND o.recurring_id = t.recurring_id AND o.date = t.date
      AND o.deleted_at IS NULL AND o.id < t.id
  );

-- 2) One LIVE transaction per (user, recurring template, date). Partial: only
--    constrains generated rows (recurring_id NOT NULL) and ignores soft-deleted
--    ones, so deleting a slot and regenerating it later stays allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_slot
  ON transactions (user_id, recurring_id, date)
  WHERE recurring_id IS NOT NULL AND deleted_at IS NULL;
