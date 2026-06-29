-- 0074 — reminder category
-- Lets a reminder carry a category from the SHARED task_categories taxonomy,
-- so the category filter pills on the tasks/reminders screen apply to both
-- entities. Additive + data-safe: nullable FK, existing rows stay NULL, and
-- ON DELETE SET NULL keeps the reminder if its category is later removed.

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES task_categories(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
