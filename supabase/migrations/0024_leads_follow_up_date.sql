-- ════════════════════════════════════════════════════════════════
-- Migration 0024 — lead follow-up date
-- Date: 2026-06-10
-- ════════════════════════════════════════════════════════════════
-- A soft "next touch" date on a lead. Surfaced as a calendar event, an
-- overdue banner + follow-ups panel on the leads screen, and in the home
-- "דורש תשומת לב" widget. "Overdue" = follow_up_date <= today AND the lead
-- is still in_process (closed metas suppress it).
--
-- Additive + data-preserving: one nullable date column. Existing leads get
-- NULL (no follow-up). Re-running is a no-op (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date date;

NOTIFY pgrst, 'reload schema';
