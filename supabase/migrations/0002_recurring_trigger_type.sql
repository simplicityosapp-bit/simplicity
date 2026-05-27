-- ============================================================
-- Migration 0002 — add trigger_type to recurring_templates
-- Date: 2026-05-27
--
-- Background
--   A recurring expense template can fire on a fixed schedule
--   (cadence_type = monthly_date / weekly — existing behaviour) OR
--   alongside a recurring meeting on a linked client/group. The new
--   trigger_type column distinguishes the two modes:
--
--     'schedule'    — engine walks day_of_month/day_of_week as before
--     'on_meeting'  — engine ignores cadence; one pending tx is
--                     created per pending scheduled_meeting on the
--                     same subject (client_id / group_id).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS guards re-runs.
-- ============================================================

ALTER TABLE recurring_templates
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'schedule';

ALTER TABLE recurring_templates
  DROP CONSTRAINT IF EXISTS recurring_templates_trigger_type_check;

ALTER TABLE recurring_templates
  ADD CONSTRAINT recurring_templates_trigger_type_check
  CHECK (trigger_type IN ('schedule', 'on_meeting'));
