-- ════════════════════════════════════════════════════════════════
-- Migration 0106 — reminders may link to an investment
-- Date: 2026-08-01
-- ════════════════════════════════════════════════════════════════
-- The finance investment row gets a "תזכיר לי" action that creates a normal
-- reminder ("set aside 10% of last month's income"). For that reminder to know
-- what it is about — so it can be recognised, filtered and later deep-linked
-- back to the widget — linked_to_type needs an 'investment' value.
--
-- reminders_linked_to_type_check currently allows:
--   client, project, group, task, transaction, lead, period
--
-- This WIDENS that list. It does not narrow it, drop a column, or touch a row:
-- every existing reminder still satisfies the new constraint, because the new
-- set is a strict superset of the old one. Nothing about any current user's
-- data changes on the day this runs.
--
-- NOTE ON linked_to_id: it stays NULL for investment reminders. The reminder is
-- about the recurring habit, not about one recorded investment — there is no
-- single row to point at. The column is nullable text and no constraint pairs
-- it with linked_to_type, so this is valid as-is.
--
-- Re-running is a no-op (DROP ... IF EXISTS before the ADD).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_linked_to_type_check;

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_linked_to_type_check
  CHECK ((linked_to_type = ANY (ARRAY[
    'client'::text,
    'project'::text,
    'group'::text,
    'task'::text,
    'transaction'::text,
    'lead'::text,
    'period'::text,
    'investment'::text
  ])));
