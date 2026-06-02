-- ════════════════════════════════════════════════════════════════
-- Migration 0009 — lead status restructure
-- ════════════════════════════════════════════════════════════════
-- TWO changes:
--
-- 1. "רפאים" (ghost) stops being its own meta column. It becomes a
--    SUB-status (a reason) under "לא רלוונטי" (not_relevant). Ghost is a
--    way a lead becomes irrelevant — it went silent — so it belongs as a
--    reason inside not_relevant, alongside "לא מעוניין", "לא מתאים" וכו'.
--
-- 2. lead_statuses gains sort_order so sub-statuses can be drag-reordered
--    within their column (leads "סטטוסים" view).
--
-- DATA SAFETY: ghost leads are reclassified to not_relevant and tagged
-- with a "רפאים" sub-status (created per-user only where ghost data
-- exists); no lead is deleted. Constraints are loosened-then-retightened
-- AFTER the data is migrated so nothing violates the new CHECK.
-- ════════════════════════════════════════════════════════════════

-- ── sort_order for sub-status reordering ───────────────────────────
alter table lead_statuses add column if not exists sort_order integer not null default 0;

-- ── 1. Ensure a "רפאים" sub-status exists under not_relevant for every
--       user that currently has ghost leads or a ghost sub-status. ─────
insert into lead_statuses (user_id, meta_category, display_name, color, icon, is_default, legacy_key, sort_order)
select distinct u.user_id, 'not_relevant', 'רפאים', '#A8A097', '🌫', false, 'ghost', 90
from (
  select user_id from leads where status_meta = 'ghost'
  union
  select user_id from lead_statuses where meta_category = 'ghost' and deleted_at is null
) u
where not exists (
  select 1 from lead_statuses s
  where s.user_id = u.user_id and s.legacy_key = 'ghost' and s.deleted_at is null
);

-- ── 2. Reassign ghost leads → not_relevant, pointing at that sub-status.
--       Only overwrite status_id when the lead has none / a ghost one. ──
update leads l
set status_meta = 'not_relevant',
    status_id = coalesce(
      (select s.id from lead_statuses s
       where s.user_id = l.user_id and s.legacy_key = 'ghost' and s.deleted_at is null
       limit 1),
      l.status_id)
where l.status_meta = 'ghost';

-- ── 3. Any sub-status still sitting under the ghost meta → not_relevant.
update lead_statuses set meta_category = 'not_relevant' where meta_category = 'ghost';

-- ── 4. Retighten the CHECK constraints to drop 'ghost'. ────────────
alter table leads drop constraint if exists leads_status_meta_check;
alter table leads add constraint leads_status_meta_check
  check (status_meta in ('in_process', 'converted', 'not_relevant'));

alter table lead_statuses drop constraint if exists lead_statuses_meta_category_check;
alter table lead_statuses add constraint lead_statuses_meta_category_check
  check (meta_category in ('in_process', 'converted', 'not_relevant'));
