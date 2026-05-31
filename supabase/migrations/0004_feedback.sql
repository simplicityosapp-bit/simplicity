-- ============================================================
-- Migration 0004 — feedback inbox
-- Date: 2026-05-31
--
-- Background
--   Free-text feedback written from inside the app. Each row is also
--   emailed to the team via the `send-feedback` edge function; the row
--   is the durable copy so nothing is lost if the email send fails.
--
-- Additive only
--   Creates a brand-new table. No existing column or table is altered
--   or dropped, so no user data is touched. Re-running is a no-op
--   (IF NOT EXISTS / DROP POLICY IF EXISTS guards).
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid()
                REFERENCES auth.users(id) ON DELETE CASCADE,
  message     text NOT NULL CHECK (char_length(btrim(message)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- A signed-in user may submit + read back only their own rows.
DROP POLICY IF EXISTS feedback_select ON feedback;
CREATE POLICY feedback_select ON feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS feedback_insert ON feedback;
CREATE POLICY feedback_insert ON feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_feedback_user       ON feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);
