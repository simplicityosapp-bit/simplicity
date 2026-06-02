-- ════════════════════════════════════════════════════════════════
-- Migration 0011 — client manual "sessions done" adjustment
-- ════════════════════════════════════════════════════════════════
-- Lets the user edit "נעשה" (sessions actually held) directly from the
-- card — useful for imported clients with no per-session records. Like the
-- balance adjustment, it's a signed delta on top of the real count:
--     done = count(private session records) + sessions_done_adjustment
-- so logging a real session afterwards still increments correctly.
--
-- DATA SAFETY: purely additive, defaulted to 0, no existing value changed.
-- ════════════════════════════════════════════════════════════════

alter table clients add column if not exists sessions_done_adjustment integer not null default 0;
