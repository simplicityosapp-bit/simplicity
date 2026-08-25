-- ════════════════════════════════════════════════════════════════
-- Migration 0111 — project lifecycle status
-- Date: 2026-08-25
-- ════════════════════════════════════════════════════════════════
-- Background
--   `projects` has never carried a lifecycle. A project that wrapped up
--   stayed in the list forever, kept its row in "סיכום פרויקטים", and wore
--   a permanently-hardcoded "פעיל" tag on its card — a label that could not
--   be false because nothing was ever able to set it. The only way to get a
--   finished project out of the way was to delete it, which also takes its
--   history out of every screen that reads project_id.
--
--   Groups already model exactly this (`groups.status`: active /
--   in_development / ended). Projects take the two states that actually
--   apply to them — a project is running or it is done; "בפיתוח" is a
--   group-cohort idea, not a practice-area one.
--
--   Deliberately NOT a cascade. Flipping a group to "ended" propagates to
--   its member clients (see project-detail → propagateToClients, migration
--   0062). A project ending must NOT touch its clients: a coach who wraps
--   up "סדנאות קבוצתיות" still has those people as clients, often inside
--   another project. This column changes what the projects LIST shows and
--   nothing else. The summary card deliberately keeps counting ended
--   projects — hiding a card is a filing decision, but retro-editing the
--   month's income would be a false financial report (owner decision,
--   2026-08-25).
--
-- Additive + data-preserving
--   One new text column, NOT NULL DEFAULT 'active', constrained to the two
--   known values. Every existing project becomes 'active', which is exactly
--   what the app assumed before this migration — so the list, the summary
--   and every card read the same the moment after it runs as the moment
--   before. No column is dropped, renamed or rewritten, and no row is
--   touched beyond receiving the default.
--
--   Re-running is a no-op: ADD COLUMN IF NOT EXISTS, and the constraint is
--   added only when absent.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_status_check
      CHECK (status IN ('active', 'ended'));
  END IF;
END $$;

-- The list filters on it on every render, scoped to the owner by RLS.
CREATE INDEX IF NOT EXISTS projects_user_status_idx
  ON projects (user_id, status)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN projects.status IS
  'Project lifecycle: active | ended. Filters the projects list; never cascades to the project''s clients (migration 0111).';
