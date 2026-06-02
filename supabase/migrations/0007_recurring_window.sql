-- ════════════════════════════════════════════════════════════════
-- Migration 0007 — recurring window: end time + start/end dates
-- ════════════════════════════════════════════════════════════════
-- groups + clients already carry a recurring slot as day-of-week
-- (recurring_day) + start time (recurring_time). This adds:
--   recurring_end_time   text  — the slot's END time (so it's a range)
--   recurring_start_date date  — when the recurring series begins
--   recurring_end_date   date  — when it ends (null = open-ended)
--
-- DATA SAFETY: purely additive, all nullable, no existing value changed.
-- ════════════════════════════════════════════════════════════════

alter table groups  add column if not exists recurring_end_time   text;
alter table groups  add column if not exists recurring_start_date date;
alter table groups  add column if not exists recurring_end_date   date;

alter table clients add column if not exists recurring_end_time   text;
alter table clients add column if not exists recurring_start_date date;
alter table clients add column if not exists recurring_end_date   date;
