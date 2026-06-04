-- ════════════════════════════════════════════════════════════════
-- Migration 0013 — personal quotes table + seed infrastructure
-- (beta feedback 03/06/2026, approved 04/06/2026)
-- ════════════════════════════════════════════════════════════════
-- 1. user_quotes — user-managed personal quotes (RLS own-rows,
--    soft-delete, same conventions as every user table).
-- 2. quotes — unique guard on text, so the system-pool seed (a
--    separate script, generated from the owner's curated list of
--    real quotes) is idempotent: ON CONFLICT (text) DO NOTHING.
-- DATA SAFETY: purely additive — no column drops, no updates to
-- existing rows.
-- ════════════════════════════════════════════════════════════════

-- ░░ PART A — user_quotes table ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

CREATE TABLE IF NOT EXISTS user_quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        text NOT NULL CHECK (char_length(btrim(text)) > 0),
  author      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

DROP TRIGGER IF EXISTS trg_user_quotes_updated ON user_quotes;
CREATE TRIGGER trg_user_quotes_updated BEFORE UPDATE ON user_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_quotes_own ON user_quotes;
CREATE POLICY user_quotes_own ON user_quotes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_quotes_user ON user_quotes (user_id);

-- ░░ PART B — unique guard for the future system-pool seed ░░░░░░░░

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_text_uniq ON quotes (text);

NOTIFY pgrst, 'reload schema';

-- ░░ SEED — runs separately once the curated list is ready ░░░░░░░░
-- Template (the owner supplies the list; each row is one quote):
--
--   INSERT INTO quotes (text, author) VALUES
--   ('טקסט הציטוט', 'שם המחבר'),
--   ('ציטוט ללא מחבר', NULL)
--   ON CONFLICT (text) DO NOTHING;
