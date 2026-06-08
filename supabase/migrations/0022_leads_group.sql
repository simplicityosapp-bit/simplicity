-- ════════════════════════════════════════════════════════════════
-- Migration 0022 — leads: group association
-- Date: 2026-06-08
-- ════════════════════════════════════════════════════════════════
-- Follow-up to 0021 (leads.project_id). A lead tied to a project that
-- HAS groups can now also be tied to a specific group within it. The
-- group picker in the Add/Edit/Convert lead modals appears only when the
-- chosen project has groups; on conversion the group carries over to the
-- new client (clients.group_id already exists). This also unlocks future
-- group-scoped goals (e.g. "inquiries for group X").
--
-- Additive + data-preserving: one nullable FK column. Existing rows get
-- group_id = NULL (unassigned) — the intended default, no backfill. ON
-- DELETE SET NULL keeps the lead if its group is removed. Re-running is a
-- no-op (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_group ON leads (group_id);

NOTIFY pgrst, 'reload schema';
