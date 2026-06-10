-- ════════════════════════════════════════════════════════════════
-- Migration 0023 — calendar_events ownership ("claim" a Google event)
-- Date: 2026-06-10
-- ════════════════════════════════════════════════════════════════
-- Lets the user OWN a synced Google event so they can edit its title /
-- time or delete it for good, and have those changes stick.
--
-- Why a flag is needed: the one-way sync (google-calendar Edge Function)
-- upserts every event by (user_id, google_event_id) on each run, which
-- OVERWRITES title/start_time/end_time and RESETS deleted_at to null.
-- The function now SKIPS any row with owned=true, so an owned event is
-- fully detached from the sync — the user's edits and deletion survive.
--
-- Additive + data-preserving: a single boolean column with a default.
-- Existing rows get owned=false (unchanged behaviour). Re-running is a
-- no-op (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS owned boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
