-- ════════════════════════════════════════════════════════════════
-- Migration 0110 — a manual progress entry belongs to a GOAL
-- Date: 2026-08-21
-- ════════════════════════════════════════════════════════════════
-- goal_entries were scoped to a CATEGORY. Every manual goal a coach creates
-- resolves to ONE shared bucket (lib/goalPresets → MANUAL_CATEGORY, "אחר" /
-- "אישי"), and the scoring engine sums a category's entries into every goal in
-- it. So two manual goals in the same account are the same goal as far as
-- progress is concerned:
--
--   log 3 toward "5 blog posts"  →  "10 sales calls" also reads 3/10,
--   both cards show the same history list, and the מבט על ring counts that
--   one number twice.
--
-- Reproduced end to end in the app before writing this.
--
-- DATA-PRESERVING BY CONSTRUCTION:
--   * goal_id is NULLABLE and category_id is untouched — nothing is dropped,
--     nothing is rewritten, and a rollback is `drop column`.
--   * The backfill attributes an entry only where its category holds exactly
--     ONE live parent goal, which makes the attribution a fact rather than a
--     guess. Anything ambiguous stays NULL instead of being silently assigned
--     to a goal the coach never meant.
--   * Scoring falls back to category matching for NULL rows, so a legacy entry
--     keeps behaving exactly as it does today. Nobody's numbers move.
--   * Soft-deleted rows are backfilled too: they can be restored within 30
--     days, and a restored entry must not come back with the old behaviour.
--
-- Measured against production first: 5 manual categories across 5 users, 7 live
-- entries, ALL of them in single-goal categories — zero ambiguous rows to
-- strand. One category does hold two goals (a coach's two cleaning routines)
-- but has no entries yet, so it is exactly the case this prevents rather than
-- one it has to repair.
-- ════════════════════════════════════════════════════════════════

alter table public.goal_entries
  add column if not exists goal_id uuid references public.goals(id) on delete cascade;

comment on column public.goal_entries.goal_id is
  'The goal this progress belongs to. NULL = a legacy row written before 0110, which still scores against every goal in its category.';

create index if not exists idx_goal_entries_goal
  on public.goal_entries using btree (goal_id);

-- Backfill only the unambiguous rows. array_agg[1] rather than min(): min()
-- has no uuid aggregate, and the HAVING already guarantees a single element.
update public.goal_entries e
set goal_id = sole.goal_id
from (
  select g.category_id, (array_agg(g.id))[1] as goal_id
  from public.goals g
  where g.deleted_at is null
    and g.parent_goal_id is null
  group by g.category_id
  having count(*) = 1
) sole
where e.goal_id is null
  and e.category_id = sole.category_id;
