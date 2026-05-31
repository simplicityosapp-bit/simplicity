-- ════════════════════════════════════════════════════════════════
-- Migration 0005 — flexible group billing
-- ════════════════════════════════════════════════════════════════
-- Groups can now bill three ways instead of forcing a fixed package:
--   'package'     — one price for a fixed number of sessions (the old
--                   behaviour; package_price + package_sessions).
--   'per_session' — price_per_session × sessions actually held.
--   'none'        — no group-level price at all; pricing lives on the
--                   per-member override (group_members.total_override)
--                   or is tracked manually.
--
-- DATA SAFETY:
--   • package_price / package_sessions lose their NOT NULL constraint
--     but keep every existing value untouched.
--   • billing_mode is added with DEFAULT 'package', so every existing
--     row is classified exactly as it behaves today — zero change to
--     current balances.
--   • No column is dropped; no row is rewritten beyond the default fill.
-- ════════════════════════════════════════════════════════════════

-- 1. Relax the package columns so an open group can omit them.
alter table groups alter column package_price    drop not null;
alter table groups alter column package_sessions drop not null;

-- 2. Per-session rate (used only when billing_mode = 'per_session').
alter table groups add column if not exists price_per_session numeric;

-- 3. Explicit billing mode. Existing rows backfill to 'package' via the
--    default, preserving today's behaviour exactly.
alter table groups
  add column if not exists billing_mode text not null default 'package'
  check (billing_mode in ('package', 'per_session', 'none'));
