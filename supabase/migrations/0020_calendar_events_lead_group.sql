-- ════════════════════════════════════════════════════════════════
-- Migration 0020 — calendar_events: lead + group association
-- Date: 2026-06-07
-- ════════════════════════════════════════════════════════════════
-- Beta: synced Google Calendar events can now also be identified to a
-- LEAD or a GROUP (in addition to client + project from 0019). The sync
-- fuzzy-matches the event title against lead and group names too, and the
-- UI lets the user assign either by hand.
--
-- Additive + data-preserving: two nullable FK columns. ON DELETE SET NULL
-- keeps the event if its lead/group is removed. Re-running is a no-op.
--
-- DEPLOY ORDER: apply this (and 0019) BEFORE redeploying the
-- `google-calendar` edge function — the new function writes lead_id /
-- group_id; without the columns the sync would error.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS lead_id  uuid REFERENCES leads(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_lead  ON calendar_events (lead_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_group ON calendar_events (group_id);

NOTIFY pgrst, 'reload schema';
