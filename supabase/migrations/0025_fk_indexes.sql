-- 0025_fk_indexes.sql
-- Add indexes on foreign-key columns that the app filters/joins on but that
-- were never indexed. Postgres does NOT auto-index FK columns, so each of
-- these currently triggers a sequential scan on filter AND on the parent's
-- ON DELETE SET NULL/CASCADE. Surfaced by the 2026-06-10 overnight review.
--
-- 100% ADDITIVE and idempotent (IF NOT EXISTS) — no data change, safe to run.
-- On a large table CREATE INDEX takes a brief lock; these per-user tables are
-- small, so a plain build is fine. If any table is big, swap to
-- CREATE INDEX CONCURRENTLY (must run outside a transaction).

-- transactions: finance filters by category; the recurring engine joins on recurring_id
CREATE INDEX IF NOT EXISTS idx_transactions_category  ON transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions (recurring_id);

-- recurring_templates: category filter + SET NULL on category delete
CREATE INDEX IF NOT EXISTS idx_recurring_templates_category ON recurring_templates (category_id);

-- clients / leads: the REAL status FK is status_id (the existing idx_clients_status /
-- idx_leads_status are on the legacy TEXT `status` column, not this UUID FK that
-- drives the kanban board).
CREATE INDEX IF NOT EXISTS idx_clients_status_id ON clients (status_id);
CREATE INDEX IF NOT EXISTS idx_leads_status_id   ON leads (status_id);

-- leads: source analytics + conversion lookup
CREATE INDEX IF NOT EXISTS idx_leads_source    ON leads (source_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads (converted_to_client_id);

-- goals: SET NULL scan when a tracked question is deleted + "goals by question" lookup
CREATE INDEX IF NOT EXISTS idx_goals_tracked_question ON goals (tracked_by_question_id);

-- goal_entries: project/group rollups (goals already indexes these two; goal_entries didn't)
CREATE INDEX IF NOT EXISTS idx_goal_entries_project ON goal_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_goal_entries_group   ON goal_entries (group_id);

-- scheduled_meetings: SET NULL scan when a session is deleted
CREATE INDEX IF NOT EXISTS idx_scheduled_meetings_session ON scheduled_meetings (session_id);

-- lead_status_log: transition queries + SET NULL/CASCADE on a status delete
CREATE INDEX IF NOT EXISTS idx_lead_status_log_from ON lead_status_log (from_status_id);
CREATE INDEX IF NOT EXISTS idx_lead_status_log_to   ON lead_status_log (to_status_id);
