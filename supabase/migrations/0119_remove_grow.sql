-- ════════════════════════════════════════════════════════════════
-- 0119 — Remove the Grow (Meshulam) payment-gateway integration.
-- ════════════════════════════════════════════════════════════════
-- Grow is not going to be connected (owner decision, 2026-10-19). The
-- integration was built behind GROW_ENABLED=false and never went live; the app
-- code, the grow / grow-webhook / grow-poll edge functions and booking-intake's
-- pay-at-booking path are removed in the same change. This drops what the
-- database held for it: migrations 0060, 0061, 0071, 0072, 0078 and the two FK
-- indexes 0113 added on pending_grow_imports.
--
-- Checked against the live database on 2026-10-19 before writing this:
--   • every object below is empty / unset: payment_requests 0 rows,
--     pending_grow_imports 0 rows, user_integrations has no 'grow' row and no
--     row with page_code / grow_auto_receipt / grow_import_enabled set,
--     transactions.grow_transaction_id is NULL everywhere, no booking page has
--     require_payment, every booking has payment_status 'none' and no deadline;
--   • nothing references them — no function body, view or policy; the only
--     foreign keys are the two tables' own outgoing ones;
--   • no cron job calls a Grow function.
-- So this removes nothing anyone has.
--
-- Run ONLY after booking-intake and claude-mcp are redeployed without the
-- columns: the deployed booking-intake filtered bookings on payment_status, and
-- claude-mcp read payment_requests and bookings.payment_status.
--
-- No CASCADE anywhere: if something unexpected still depended on one of these,
-- the statement must fail rather than take it along.
-- ════════════════════════════════════════════════════════════════

-- Tables used only by Grow (their indexes, RLS policies and updated_at trigger
-- go with them).
DROP TABLE IF EXISTS public.payment_requests;
DROP TABLE IF EXISTS public.pending_grow_imports;

-- Grow-only columns on shared tables.
ALTER TABLE public.user_integrations
  DROP COLUMN IF EXISTS page_code,
  DROP COLUMN IF EXISTS grow_auto_receipt,
  DROP COLUMN IF EXISTS grow_import_enabled;

DROP INDEX IF EXISTS public.transactions_grow_tx_uniq;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS grow_transaction_id;

ALTER TABLE public.booking_pages DROP COLUMN IF EXISTS require_payment;

DROP INDEX IF EXISTS public.idx_bookings_awaiting;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_chk;
ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS payment_deadline;

NOTIFY pgrst, 'reload schema';
