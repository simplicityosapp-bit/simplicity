-- ════════════════════════════════════════════════════════════════
-- Migration 0097 — clients.attention_snoozed_at ("התעלם" בווידג'ט)
-- Date: 2026-07-20
-- ════════════════════════════════════════════════════════════════
-- The home "דרושה תשומת לב" widget raises a row for every active /
-- on-break client with no recorded session in 45 days. Until now that
-- row had no exit: the only way to clear a client from it was to log a
-- session. A coach who had already handled the client another way (a
-- phone call, a message, a deliberate pause) was stuck looking at a
-- nudge they could not dismiss.
--
-- This column is that exit. "התעלם" stamps now() and the 45-day rule
-- treats the stamp exactly like a session date:
--
--   surfaces  ⇔  max(last_session, attention_snoozed_at) < now - 45d
--
-- SNOOZE, NOT MUTE (owner decision 20/07): dismissing restarts the same
-- clock rather than silencing the client forever. If the gap keeps
-- growing the client comes back in another 45 days, so a mis-click can
-- never drop someone off the radar permanently.
--
-- Additive + data-preserving: one nullable column, no existing column
-- touched, no backfill. NULL = never dismissed = current behaviour, so
-- the day this runs every client keeps the exact status they have now.
-- Re-running is a no-op (IF NOT EXISTS).
--
-- No RLS change needed — clients' owner-only policies already cover
-- every column on the row.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS attention_snoozed_at timestamptz;

COMMENT ON COLUMN clients.attention_snoozed_at IS
  'When the coach last pressed "התעלם" on this client in the home attention widget. Read by clientsNeedingAttention() as a session-equivalent timestamp: the client resurfaces once this is older than the 45-day window. NULL = never dismissed.';

-- Partial index: the rule only ever reads rows that carry a stamp, and
-- those are a small minority of the table.
CREATE INDEX IF NOT EXISTS clients_attention_snoozed_at_idx
  ON clients (user_id, attention_snoozed_at)
  WHERE attention_snoozed_at IS NOT NULL;
