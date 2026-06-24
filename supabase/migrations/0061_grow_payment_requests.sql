-- ════════════════════════════════════════════════════════════════
-- Migration 0061 — Grow payment requests (payment links + lifecycle)
-- Date: 2026-06-24
-- ════════════════════════════════════════════════════════════════
-- One new table tracking each Grow payment link from creation → paid.
-- A link is created from a surface (client balance / a specific income
-- transaction / a payment-plan installment / a booking page) and carries
-- the correlation back from Grow's server callback so we record income
-- exactly ONCE (single-source-of-truth = the webhook).
--
-- Additive: new table only, no existing data touched. Re-running is a
-- no-op (CREATE TABLE/INDEX/POLICY IF NOT EXISTS, guarded policy).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id          uuid REFERENCES clients(id) ON DELETE SET NULL,
  transaction_id     uuid REFERENCES transactions(id) ON DELETE SET NULL,
  installment_id     uuid REFERENCES payment_installments(id) ON DELETE SET NULL,
  booking_id         uuid,  -- Phase 3 (booking-page payments); no FK yet to avoid coupling
  source             text NOT NULL CHECK (source IN ('client','transaction','installment','booking')),
  amount             numeric NOT NULL CHECK (amount > 0),
  description        text,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','cancelled','failed')),
  grow_process_id    text,
  grow_process_token text,
  grow_transaction_id text,
  payment_url        text,
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Idempotency / dedup: a given Grow transaction id maps to at most one row
-- per user — the webhook claims on this so a retried callback can't double-record.
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_grow_tx_uniq
  ON payment_requests (user_id, grow_transaction_id) WHERE grow_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_requests_user ON payment_requests (user_id);
CREATE INDEX IF NOT EXISTS payment_requests_client ON payment_requests (user_id, client_id);

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
-- Owner can READ their own payment requests (to see pending/paid status in the
-- UI). All WRITES happen via the edge functions (service-role, bypasses RLS) —
-- the browser never inserts/updates these rows directly, and the Grow process
-- ids / tokens are only ever written server-side.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_requests' AND policyname = 'payment_requests_select_own'
  ) THEN
    CREATE POLICY payment_requests_select_own ON payment_requests
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
