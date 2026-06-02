-- ════════════════════════════════════════════════════════════════
-- Migration 0010 — client manual balance adjustment
-- ════════════════════════════════════════════════════════════════
-- Lets the user edit a client's "שולם" / "יתרה" directly from the card
-- WITHOUT faking income transactions and WITHOUT freezing the automatic
-- price × sessions engine. The adjustment is a signed credit added to the
-- client's real paid total:
--     paid    = Σ(income transactions) + balance_adjustment
--     balance = total − paid
-- So zeroing a balance after a price change keeps future sessions billing
-- automatically at the new price, while the past difference is absorbed
-- by the adjustment.
--
-- DATA SAFETY: purely additive, defaulted to 0, no existing value changed.
-- ════════════════════════════════════════════════════════════════

alter table clients add column if not exists balance_adjustment numeric not null default 0;
