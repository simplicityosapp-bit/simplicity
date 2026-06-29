-- 0073 — task due date/time
-- Adds an optional due timestamp to tasks so a dated task can surface on the
-- reminders view alongside reminders. Additive + data-safe: the column is
-- nullable, existing rows stay NULL (untouched), and a partial index keeps the
-- "tasks with a due date" lookups cheap.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tasks_user_due
  ON tasks (user_id, due_at)
  WHERE due_at IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
