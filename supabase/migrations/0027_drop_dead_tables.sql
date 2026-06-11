-- 0027_drop_dead_tables.sql
-- Drop three tables that are DEAD in the codebase: defined in the schema but
-- with NO writer or reader anywhere in src/ (they appeared only in the old
-- resetAllUserData lists, now removed). Each is a leaf table — nothing
-- references them — so the drop is clean (indexes / policies / triggers go too).
--   client_notes         — a dated-timeline-notes feature never built; the app
--                          uses the single clients.notes field instead.
--   session_attachments  — file attachments; no Storage bucket was ever wired.
--   reminder_occurrences — per-occurrence reminder overrides (O5); never built.
--
-- ⚠️ RUN THE COUNT CHECK FIRST and confirm all three are 0 rows:
--   SELECT 'client_notes' t, count(*) FROM client_notes
--   UNION ALL SELECT 'session_attachments', count(*) FROM session_attachments
--   UNION ALL SELECT 'reminder_occurrences', count(*) FROM reminder_occurrences;
DROP TABLE IF EXISTS client_notes;
DROP TABLE IF EXISTS session_attachments;
DROP TABLE IF EXISTS reminder_occurrences;
