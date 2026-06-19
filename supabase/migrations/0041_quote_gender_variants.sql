-- ════════════════════════════════════════════════════════════════
-- Migration 0041 — gendered variants for system quotes
-- ════════════════════════════════════════════════════════════════
-- Some quotes address the reader directly ("אתה לא יכול…", masculine
-- imperatives). To match the user's form of address, add optional
-- male/female variants alongside the neutral base `text`. The client
-- resolves text_male / text_female by prefs.design.gender and falls
-- back to `text` (so untouched quotes and personal quotes are safe).
--
-- DATA SAFETY: purely additive — two nullable columns, no drops, no
-- updates to existing rows. The content fixes (canonical + semantic +
-- gender variants) land in 0042. Idempotent via IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS text_male   text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS text_female text;

NOTIFY pgrst, 'reload schema';
