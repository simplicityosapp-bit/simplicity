-- ════════════════════════════════════════════════════════════════
-- Migration 0047 — Lead Pages: project association
-- Date: 2026-06-21
-- ════════════════════════════════════════════════════════════════
-- A lead page can be tied to a PROJECT. Leads captured through the page
-- inherit that project (the `lead-intake` edge function copies it onto
-- the new lead, which already has a project_id column), so the data is
-- attributed correctly. The project detail screen also surfaces a link
-- to its associated pages.
--
-- Additive + data-preserving: one nullable FK column. Existing pages get
-- project_id = NULL (unassigned) — the intended default, no backfill.
-- ON DELETE SET NULL keeps the page if its project is removed. Re-running
-- is a no-op (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE lead_pages
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_pages_project ON public.lead_pages (project_id);

NOTIFY pgrst, 'reload schema';
