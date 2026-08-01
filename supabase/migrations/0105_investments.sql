-- ════════════════════════════════════════════════════════════════
-- Migration 0105 — investments (היסטוריית ההשקעות של ווידג'ט האחוזים)
-- Date: 2026-08-01
-- ════════════════════════════════════════════════════════════════
-- The finance screen gets a row that computes "how much to invest": a
-- percentage of last month's income (or net). Pressing "השקעתי" records that
-- the money actually went in. This table is that record.
--
-- WHY A TABLE AND NOT JUST A CATEGORY (owner decision 01/08):
--   The obvious cheap version is "an expense in a category named השקעות, and
--   the history is a query over that category". It was rejected because
--   `categories` carries no stable key — only a user-editable `name`. Renaming
--   or deleting the category would silently rewrite the user's investment
--   history after the fact. The record of "I invested ₪800 in August" must not
--   depend on what a category is called today.
--
-- HOW IT PAIRS WITH THE FINANCE SCREEN:
--   Each investment ALSO creates a normal expense transaction, so the money
--   shows up in the ledger and in נטו like any other outgoing. transaction_id
--   links the two. The widget then excludes exactly those transaction ids when
--   it computes its base — by id, never by category name — so the target can't
--   eat itself: an investment recorded in August would otherwise shrink
--   August's net, which is what September's target is computed from, and the
--   figure would spiral downward month over month.
--
--   ON DELETE SET NULL, deliberately: if the expense is ever hard-deleted, the
--   fact that the user invested still happened. The history keeps the row and
--   simply loses its link. CASCADE would destroy user data as a side effect of
--   tidying the ledger.
--
-- Owner-only RLS, same pattern as client_adjustments (migration 0095).
-- Purely additive: one new table. No existing column, constraint or row is
-- touched, so nothing about any current user's data changes on the day this
-- runs. Re-running is a no-op (IF NOT EXISTS throughout).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS investments (
  id             uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id        uuid NOT NULL,
  amount         numeric NOT NULL DEFAULT 0,
  -- The day the money went in. Date-only on purpose: this is a calendar fact
  -- ("invested in August"), not an instant, and the widget buckets it by month.
  invested_on    date NOT NULL DEFAULT CURRENT_DATE,
  -- The expense row this investment created. NULL is legitimate: the linked
  -- transaction may have been hard-deleted, or a row may predate the link.
  transaction_id uuid,
  note           text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL,
  -- Soft delete, so an accidental "השקעתי" is undoable and lands in the same
  -- 30-day trash every other entity uses.
  deleted_at     timestamp with time zone,
  CONSTRAINT investments_pkey PRIMARY KEY (id),
  CONSTRAINT investments_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT investments_transaction_id_fkey FOREIGN KEY (transaction_id)
    REFERENCES transactions(id) ON DELETE SET NULL,
  CONSTRAINT investments_amount_check CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_investments_user ON public.investments (user_id);
-- The widget's base excludes invested transactions on every finance render,
-- so the lookup by transaction_id is a hot path.
CREATE INDEX IF NOT EXISTS idx_investments_transaction ON public.investments (transaction_id);

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS investments_own ON investments;
CREATE POLICY investments_own ON investments
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_investments_updated ON public.investments;
CREATE TRIGGER trg_investments_updated
  BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE investments IS
  'Record of money the user confirmed investing, for the finance screen''s investment-percentage widget. Each row normally links to the expense transaction it created (transaction_id, SET NULL on delete so the record survives). The widget excludes these transaction ids from its base so the target does not shrink itself month over month. Created by migration 0105.';
