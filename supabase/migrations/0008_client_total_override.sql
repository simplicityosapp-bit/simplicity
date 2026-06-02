-- ════════════════════════════════════════════════════════════════
-- Migration 0008 — client manual "total due" override
-- ════════════════════════════════════════════════════════════════
-- The clients table gained total_override + has_custom_price in
-- schema.sql (so the client card's "סה״כ לתשלום" edit field can store a
-- manual amount that overrides sessions × price), but no migration ever
-- added them to EXISTING databases. Without these columns the edit
-- silently drops the value — the user can't change a client's total/
-- balance. This backfills them.
--
-- DATA SAFETY: purely additive, both nullable / defaulted, no existing
-- value changed.
-- ════════════════════════════════════════════════════════════════

alter table clients add column if not exists total_override   numeric;
alter table clients add column if not exists has_custom_price  boolean not null default false;
