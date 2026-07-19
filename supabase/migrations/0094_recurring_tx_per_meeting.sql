-- 0094_recurring_tx_per_meeting.sql
-- ════════════════════════════════════════════════════════════════════════════
-- FIX: on_meeting recurring payments were de-duplicated by (recurring_id, DATE),
-- so TWO non-skipped meetings for the same client/group on the SAME day produced
-- only ONE pending payment — under-billing the second session. The dedup key was
-- too coarse because a generated transaction had no link back to the meeting it
-- came from. This links it, and splits the uniqueness guard so on_meeting rows
-- de-dup by MEETING while schedule-cadence rows keep de-duping by date.
--
-- ⚠️ DEPLOY ORDER: run THIS migration BEFORE deploying the app code that writes
--    scheduled_meeting_id. The old code (no such column) keeps working — it just
--    writes NULL, which the cadence index below still guards one-per-date.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) The scheduled_meeting a generated tx belongs to. NULL for schedule-cadence
--    rows and for every pre-existing row. Plain uuid (no FK): scheduled_meetings
--    rows are regenerated/pruned by the engine, and we only need the value as a
--    stable de-dup marker (meeting ids ARE stable — the engine skips existing
--    rows keyed by (subject, scheduled_at), it doesn't re-mint them).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS scheduled_meeting_id uuid;

-- 2) Replace the single (user, recurring_id, date) guard from 0028 with two
--    partial unique indexes:
--      • schedule-cadence + all legacy rows (scheduled_meeting_id IS NULL) →
--        still one LIVE row per (user, template, date), exactly as before.
--      • on_meeting rows (scheduled_meeting_id IS NOT NULL) → one LIVE row per
--        (user, template, MEETING), so two meetings on the same day each get one.
--    Existing rows all have scheduled_meeting_id = NULL, so they satisfy the new
--    cadence index unchanged — no data is touched, no dedupe needed.
DROP INDEX IF EXISTS idx_transactions_recurring_slot;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_slot
  ON transactions (user_id, recurring_id, date)
  WHERE recurring_id IS NOT NULL AND scheduled_meeting_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_meeting
  ON transactions (user_id, recurring_id, scheduled_meeting_id)
  WHERE recurring_id IS NOT NULL AND scheduled_meeting_id IS NOT NULL AND deleted_at IS NULL;
