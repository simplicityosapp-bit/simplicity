-- ════════════════════════════════════════════════════════════════
-- Migration 0062 — Grow pay-at-booking (Phase 3)
-- Date: 2026-06-28
-- ════════════════════════════════════════════════════════════════
-- Lets a booking page REQUIRE online payment (via Grow) to secure a slot.
--
-- Flow: a booking on a payment-required page is inserted as
--   status='pending', payment_status='awaiting', payment_deadline=now()+TTL
-- which HOLDS the slot (the bookings_no_overlap EXCLUDE covers all pending
-- rows). The client is redirected to Grow; on payment the grow-webhook flips
-- payment_status='paid' + clears the deadline (a permanent hold) and records
-- income. If the client never pays, booking-intake lazily cancels the expired
-- hold on the next slots-read / booking (status='cancelled' → EXCLUDE frees the
-- slot) — no cron needed.
--
-- Price comes from the chosen meeting type's existing `default_price` — no new
-- price column. `require_payment` is opt-in per page (default false), so every
-- existing page keeps behaving exactly as before.
--
-- Additive + data-preserving: one column on booking_pages, two on bookings,
-- one guarded CHECK. No DROP, no backfill. Re-running is a no-op.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE booking_pages
  ADD COLUMN IF NOT EXISTS require_payment boolean NOT NULL DEFAULT false;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_status   text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_deadline timestamptz;

-- payment_status: 'none' (no payment required) | 'awaiting' (slot held pending
-- payment) | 'paid'. Guarded so the migration stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_payment_status_chk') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_chk
      CHECK (payment_status IN ('none', 'awaiting', 'paid'));
  END IF;
END $$;

-- The lazy-release sweep filters on (status, payment_status, payment_deadline).
CREATE INDEX IF NOT EXISTS idx_bookings_awaiting
  ON public.bookings (user_id, payment_deadline)
  WHERE status = 'pending' AND payment_status = 'awaiting';

NOTIFY pgrst, 'reload schema';
