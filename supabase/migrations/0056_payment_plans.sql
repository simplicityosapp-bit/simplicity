-- ════════════════════════════════════════════════════════════════
-- Migration 0056 — Payment Plans (פריסת תשלומים)
-- Date: 2026-06-23
-- ════════════════════════════════════════════════════════════════
-- A client's total can be split into N installments, each with its own
-- number (3/6), due date, amount, and "received" state. When an installment
-- is marked received it creates a linked income TRANSACTION (the money truth
-- stays in `transactions` — finance, reports and receipts all keep working
-- through the existing system); the balance is total − sum(received).
--
-- Two new tables, both OWNER-ONLY RLS (same pattern as lead_pages). The link
-- to the created income transaction lives on the installment
-- (`transaction_id`), so un-receiving / deleting can find and remove it.
--
-- Additive + data-preserving: new tables only, no existing data touched.
-- Re-running is a no-op (IF NOT EXISTS throughout).
-- ════════════════════════════════════════════════════════════════

-- ── 1) payment_plans — one split-payment plan, belongs to a client ───────────
CREATE TABLE IF NOT EXISTS payment_plans (
  id               uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid NOT NULL,
  client_id        uuid NOT NULL,
  project_id       uuid,
  total_amount     numeric NOT NULL DEFAULT 0,
  num_installments integer NOT NULL DEFAULT 1,
  notes            text,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at       timestamp with time zone,
  CONSTRAINT payment_plans_pkey PRIMARY KEY (id),
  CONSTRAINT payment_plans_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT payment_plans_client_id_fkey FOREIGN KEY (client_id)
    REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT payment_plans_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_plans_user   ON public.payment_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_plans_client ON public.payment_plans (client_id);

ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_plans_own ON payment_plans;
CREATE POLICY payment_plans_own ON payment_plans
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_payment_plans_updated ON public.payment_plans;
CREATE TRIGGER trg_payment_plans_updated
  BEFORE UPDATE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2) payment_installments — the individual payments of a plan ──────────────
CREATE TABLE IF NOT EXISTS payment_installments (
  id             uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id        uuid NOT NULL,
  plan_id        uuid NOT NULL,
  num            integer NOT NULL,
  due_date       date,
  amount         numeric NOT NULL DEFAULT 0,
  received       boolean NOT NULL DEFAULT false,
  received_date  date,
  -- Same key set as transactions.payment_method / lib/invoiceDocs.js PAY_METHODS.
  payment_method text,
  -- The income transaction created when this installment was marked received.
  -- ON DELETE SET NULL so deleting the transaction elsewhere just unlinks it.
  transaction_id uuid,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at     timestamp with time zone,
  CONSTRAINT payment_installments_pkey PRIMARY KEY (id),
  CONSTRAINT payment_installments_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT payment_installments_plan_id_fkey FOREIGN KEY (plan_id)
    REFERENCES payment_plans(id) ON DELETE CASCADE,
  CONSTRAINT payment_installments_transaction_id_fkey FOREIGN KEY (transaction_id)
    REFERENCES transactions(id) ON DELETE SET NULL,
  CONSTRAINT payment_installments_method_chk
    CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer', 'cash', 'credit_card', 'app', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_payment_installments_user ON public.payment_installments (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_plan ON public.payment_installments (plan_id);

ALTER TABLE payment_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_installments_own ON payment_installments;
CREATE POLICY payment_installments_own ON payment_installments
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_payment_installments_updated ON public.payment_installments;
CREATE TRIGGER trg_payment_installments_updated
  BEFORE UPDATE ON public.payment_installments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
