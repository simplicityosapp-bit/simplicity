-- ════════════════════════════════════════════════════════════════
-- Migration 0012 — client informal "paid" adjustment
-- ════════════════════════════════════════════════════════════════
-- When the user edits "שולם" manually and chooses "התעלם" (don't add a
-- finance transaction), the amount is still recorded ON THE CLIENT — as an
-- informal paid credit — without polluting the finance ledger:
--     שולם (paid) = Σ(real income) + paid_adjustment
-- This is SEPARATE from balance_adjustment (the "יתרה" forgiveness, which
-- lowers the balance without touching "שולם"), so the two never collide.
--
-- DATA SAFETY: purely additive, defaulted to 0, no existing value changed.
-- ════════════════════════════════════════════════════════════════

alter table clients add column if not exists paid_adjustment numeric not null default 0;
