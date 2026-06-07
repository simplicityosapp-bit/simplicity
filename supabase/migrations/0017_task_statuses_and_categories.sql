-- ════════════════════════════════════════════════════════════════
-- Migration 0017 — custom task statuses + task categories
-- Date: 2026-06-07
-- ════════════════════════════════════════════════════════════════
-- Background
--   Beta feedback: tasks need richer, user-defined statuses (beyond the
--   built-in todo/done) and a custom category axis to group/filter by.
--   This mirrors the client_statuses pattern: every custom status rolls
--   up to a fixed meta_category ('open' | 'done'), so all existing task
--   counters — home chips, attention, next-tasks, screen totals, which
--   each test tasks.status = 'done' — keep working untouched. The app
--   keeps tasks.status in sync with the chosen status's meta on write.
--
-- Additive + data-preserving
--   Two new tables + two nullable FK columns on tasks. No column is
--   dropped or rewritten; tasks.status (todo/done) is left exactly as-is.
--   Existing tasks get status_id = NULL (they render under their todo/done
--   meta) and category_id = NULL ("ללא קטגוריה"). Nothing is auto-seeded —
--   users create their own statuses/categories. Re-running is a no-op
--   (IF NOT EXISTS / DROP-then-CREATE on policies + triggers).
-- ════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_statuses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_category text NOT NULL CHECK (meta_category IN ('open','done')),
  display_name  text NOT NULL,
  icon          text,
  color         text,
  is_default    boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE IF NOT EXISTS task_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  color         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- ── tasks: two nullable links (ON DELETE SET NULL keeps the task) ──
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS status_id   uuid REFERENCES task_statuses(id)   ON DELETE SET NULL;
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES task_categories(id) ON DELETE SET NULL;

-- ── Row Level Security (own-row only, like client_statuses) ─────
ALTER TABLE task_statuses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_statuses_own   ON task_statuses;
CREATE POLICY task_statuses_own   ON task_statuses
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS task_categories_own ON task_categories;
CREATE POLICY task_categories_own ON task_categories
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── updated_at triggers ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_task_statuses_updated   ON task_statuses;
CREATE TRIGGER trg_task_statuses_updated   BEFORE UPDATE ON task_statuses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_task_categories_updated ON task_categories;
CREATE TRIGGER trg_task_categories_updated BEFORE UPDATE ON task_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_task_statuses_user   ON task_statuses   (user_id);
CREATE INDEX IF NOT EXISTS idx_task_categories_user ON task_categories (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status_id      ON tasks (status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category_id    ON tasks (category_id);

NOTIFY pgrst, 'reload schema';
