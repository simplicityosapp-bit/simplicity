-- ════════════════════════════════════════════════════════════════
-- Migration 0019 — calendar_events: project association
-- Date: 2026-06-07
-- ════════════════════════════════════════════════════════════════
-- Beta: synced Google Calendar events should be identifiable to a
-- PROJECT as well as a client (more match targets may follow). Adds a
-- nullable project link; the sync fuzzy-matches the event title against
-- project names too, and the UI lets the user assign one by hand.
--
-- Additive + data-preserving: one nullable FK column. ON DELETE SET NULL
-- keeps the event if its project is removed. Re-running is a no-op.
--
-- DEPLOY ORDER: apply this BEFORE redeploying the `google-calendar` edge
-- function (the new function writes project_id; without the column the
-- sync would error).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events (project_id);

NOTIFY pgrst, 'reload schema';
