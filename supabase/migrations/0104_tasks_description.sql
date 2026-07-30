-- 0104_tasks_description.sql
-- Add a plaintext `description` column to tasks.
--
-- Closes an asymmetry the tasks-screen UX review turned up: a REMINDER has had
-- a "פרטים" field since it was built (reminders.description), while a task was
-- title-only. Same screen, same card, two different capabilities, with nothing
-- explaining why — a coach writing "להתקשר לדנה" had nowhere to put what the
-- call is actually about.
--
-- Plaintext, like every other free-text field in the app. Field-level
-- encryption was removed in 2026-06 (ENCRYPTED_FIELDS = {}); at-rest
-- protection here is account isolation (RLS) + encrypted transport (HTTPS).
--
-- Additive, nullable, IF NOT EXISTS → no backfill, no data change, no DROP.
-- Existing rows keep a NULL description and read exactly as they did.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;

-- Refresh PostgREST's schema cache so the new column is selectable at once
-- rather than after the next redeploy.
NOTIFY pgrst, 'reload schema';
