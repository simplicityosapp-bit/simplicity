-- ════════════════════════════════════════════════════════════════════════
-- CONSOLIDATED — all pending schema changes (migrations 0007 → 0010)
-- ════════════════════════════════════════════════════════════════════════
-- Convenience aggregate for applying every recent change in ONE run from the
-- Supabase SQL editor. 100% idempotent (add column if not exists / drop
-- constraint if exists / guarded inserts + conditional updates) — safe to run
-- more than once. Wrapped in a transaction so it's all-or-nothing.
--
-- Covers:
--   0007  recurring window (end time + start/end dates) on groups + clients
--   0008  clients.total_override + has_custom_price (manual "סה״כ לתשלום")
--   0009  ghost → sub-status under "לא רלוונטי" + lead_statuses.sort_order
--   0010  clients.balance_adjustment (manual "שולם"/"יתרה" editing)
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 0007 — recurring window ──────────────────────────────────────────────
alter table groups  add column if not exists recurring_end_time   text;
alter table groups  add column if not exists recurring_start_date date;
alter table groups  add column if not exists recurring_end_date   date;

alter table clients add column if not exists recurring_end_time   text;
alter table clients add column if not exists recurring_start_date date;
alter table clients add column if not exists recurring_end_date   date;

-- ── 0008 — client manual "total due" override ────────────────────────────
alter table clients add column if not exists total_override   numeric;
alter table clients add column if not exists has_custom_price boolean not null default false;

-- ── 0010 — client manual balance adjustment ──────────────────────────────
alter table clients add column if not exists balance_adjustment numeric not null default 0;

-- ── 0009 — lead status restructure (ghost → not_relevant) + sort_order ────
alter table lead_statuses add column if not exists sort_order integer not null default 0;

-- 1. ensure a "רפאים" sub-status under not_relevant for users with ghost data
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

-- 2. reassign ghost leads → not_relevant, pointing at that sub-status
update leads l
set status_meta = 'not_relevant',
    status_id = coalesce(
      (select s.id from lead_statuses s
       where s.user_id = l.user_id and s.legacy_key = 'ghost' and s.deleted_at is null
       limit 1),
      l.status_id)
where l.status_meta = 'ghost';

-- 3. any sub-status still under the ghost meta → not_relevant
update lead_statuses set meta_category = 'not_relevant' where meta_category = 'ghost';

-- 4. retighten the CHECK constraints to drop 'ghost'
alter table leads drop constraint if exists leads_status_meta_check;
alter table leads add constraint leads_status_meta_check
  check (status_meta in ('in_process', 'converted', 'not_relevant'));

alter table lead_statuses drop constraint if exists lead_statuses_meta_category_check;
alter table lead_statuses add constraint lead_statuses_meta_category_check
  check (meta_category in ('in_process', 'converted', 'not_relevant'));

commit;
