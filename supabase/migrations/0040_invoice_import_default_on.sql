-- ════════════════════════════════════════════════════════════════
-- Migration 0040 — income import ON by default
-- Date: 2026-06-15
-- ════════════════════════════════════════════════════════════════
-- `auto_import` is the income-import switch (ON = stage incoming docs in
-- "ייבוא ממתין" for approval; OFF = no import). The owner wants it ON by
-- default, so:
--   • new rows default to true (the `invoices` connect action also sets it
--     explicitly, so this is belt-and-suspenders), and
--   • existing invoice connections are flipped ON.
-- google_calendar rows ignore auto_import, so the column default is harmless
-- for them; the UPDATE is scoped to invoice providers anyway.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_integrations ALTER COLUMN auto_import SET DEFAULT true;

UPDATE user_integrations
  SET auto_import = true
  WHERE provider IN ('greeninvoice', 'sumit') AND auto_import IS DISTINCT FROM true;

NOTIFY pgrst, 'reload schema';
