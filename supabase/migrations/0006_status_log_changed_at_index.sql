-- ════════════════════════════════════════════════════════════════
-- Migration 0006 — index status-log tables on changed_at
-- ════════════════════════════════════════════════════════════════
-- client_status_log and lead_status_log are append-only audit trails
-- that grow without bound (one row per status transition, forever).
-- The trend queries on the moon-glance drawer filter + sort the whole
-- user's log by changed_at:
--     getClientStatusLogRange / getLeadStatusLogRange
--     → .order('changed_at').gte('changed_at', …).lte('changed_at', …)
-- Today only (user_id) and the FK are indexed, so changed_at range
-- scans + the sort run unindexed and degrade as the log accumulates.
--
-- A composite (user_id, changed_at) index serves both the RLS user
-- scope and the changed_at range/order in one shot.
--
-- DATA SAFETY:
--   • Purely additive — creates two indexes, touches no rows, drops
--     nothing. Existing data is untouched. Fully reversible (DROP INDEX).
-- ════════════════════════════════════════════════════════════════

create index if not exists idx_client_status_log_user_changed
  on client_status_log (user_id, changed_at);

create index if not exists idx_lead_status_log_user_changed
  on lead_status_log (user_id, changed_at);
