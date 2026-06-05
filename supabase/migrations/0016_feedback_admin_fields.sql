-- ════════════════════════════════════════════════════════════════
-- Migration 0016 — feedback triage fields (type + status)
-- Date: 2026-06-05
-- ════════════════════════════════════════════════════════════════
-- Background
--   The admin console (/admin/feedback) needs to classify and track
--   feedback. The original feedback table (0004) stored only the free
--   text + author; type rode along to the email but was never stored.
--   This adds two durable triage columns.
--
-- Additive + data-preserving
--   ADD COLUMN IF NOT EXISTS only — no column is dropped or rewritten.
--   Existing rows keep their message/author untouched; they simply gain
--   status='new' (the default backfills every existing row) and a NULL
--   type. Re-running is a no-op.
--
--   `type`   — bug/idea/praise/other (matches FeedbackModal), nullable
--              because legacy rows + future free-text submissions may
--              omit it.
--   `status` — new → in_progress → done. NOT NULL DEFAULT 'new', so
--              every pre-existing row is treated as untriaged.
--
-- Note on writes
--   Status changes from the admin console are performed server-side by
--   the `admin` edge function (service-role), NOT from the browser —
--   the feedback RLS policies (own-row SELECT/INSERT, no UPDATE) are
--   intentionally left untouched so the main app's security is unchanged.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS type   text
    CHECK (type IS NULL OR type IN ('bug','idea','praise','other'));

ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','in_progress','done'));

-- Filter/sort the inbox by triage state.
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback (status);

NOTIFY pgrst, 'reload schema';
