-- ════════════════════════════════════════════════════════════════════════
-- 0098 — backfill converted_at for leads dragged into the "converted" column
-- ════════════════════════════════════════════════════════════════════════
-- WHY
-- The kanban's drag handler (applyLeadMove) cleared converted_at when a lead
-- left the "converted" column but never set it when a lead ENTERED it. Only
-- ConvertLeadModal and EditLeadModal ever stamped it. So every lead that was
-- moved into "converted" by dragging sits in that column with converted_at
-- NULL, and isConvertedLead() — which every conversion COUNT gates on —
-- returns false for it.
--
-- Visible effect for the user: the leads screen reports "0 converted" and a
-- wrong conversion rate, while the column plainly shows the leads.
--
-- The code path is fixed going forward; this repairs the rows already stored.
--
-- WHAT IT TOUCHES
-- Exactly one column, on exactly the rows that are demonstrably wrong:
--   leads.converted_at, WHERE status_meta = 'converted' AND converted_at IS NULL
-- Nothing else is read or written. Leads outside the converted column, and
-- converted leads that already carry a stamp, are not touched — so a genuine
-- conversion date is never overwritten.
--
-- WHICH TIMESTAMP
-- last_status_changed_at is when the lead was moved into the column, which is
-- the conversion moment for exactly these rows. It is written by the same drag
-- handler, so it is present for every row this migration targets; updated_at
-- and created_at are fallbacks only, for rows predating that field.
--
-- Idempotent: re-running matches nothing, because the first run leaves no row
-- with status_meta='converted' and converted_at IS NULL.
-- Safe to run inside or outside a transaction.
-- ════════════════════════════════════════════════════════════════════════

-- Count the rows about to change (informational — check this before/after).
-- select count(*) from leads
-- where status_meta = 'converted' and converted_at is null and deleted_at is null;

update leads
set converted_at = coalesce(last_status_changed_at, updated_at, created_at)
where status_meta = 'converted'
  and converted_at is null;

notify pgrst, 'reload schema';
