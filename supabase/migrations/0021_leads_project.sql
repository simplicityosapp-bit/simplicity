-- ════════════════════════════════════════════════════════════════
-- Migration 0021 — leads: project association
-- Date: 2026-06-08
-- ════════════════════════════════════════════════════════════════
-- Beta: a lead should be assignable to a PROJECT (it was missing). The
-- picker lives in the Add/Edit Lead modals; on conversion the lead's
-- project is carried over and pre-filled in the Convert modal (clients
-- already carry project_id).
--
-- Additive + data-preserving: one nullable FK column. Existing rows get
-- project_id = NULL (unassigned), which is the intended default — no
-- backfill needed. ON DELETE SET NULL keeps the lead if its project is
-- removed. Re-running is a no-op (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_project ON leads (project_id);

NOTIFY pgrst, 'reload schema';
