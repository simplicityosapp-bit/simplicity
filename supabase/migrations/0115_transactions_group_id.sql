-- ════════════════════════════════════════════════════════════════
-- Migration 0115 — a payment can say which group it was for
-- ════════════════════════════════════════════════════════════════
-- A client's account is made of tracks: each group they belong to, and their
-- personal process (see domain/clients.ts). The money side had no such split.
-- A transaction carries client_id and project_id and nothing finer, so once a
-- client was in a workshop AND running private sessions, "did she pay for the
-- workshop" had no answer anywhere in the system — the app could only report
-- one balance and leave the coach to guess which half of it was settled.
--
-- The same gap is why a group card cannot say who in the group still owes, or
-- what the group brought in. Both are questions about a group's money, and a
-- payment did not know it belonged to one.
--
-- SEMANTICS
--   group_id set   → this income is for that group's dues.
--   group_id null  → not for a group: the client's personal process, or a
--                    payment recorded before there was anything to say.
--   A client with exactly ONE track needs no attribution at all — there is
--   only one thing they could be paying for — so the app asks the question
--   only when a client has more than one, and reads a single-track client's
--   payments as that track's whatever the column holds.
--
-- DATA SAFETY: adds one NULLABLE column with no default and no backfill. No
-- existing row is read, rewritten or deleted; every existing payment keeps
-- meaning exactly what it meant (null = unattributed, which is what they all
-- are). Idempotent — ADD COLUMN IF NOT EXISTS.
--
-- RLS: untouched. The row's owner is still user_id, and the existing
-- transactions policies already scope every read and write by it; a new
-- column on an already-protected row needs no policy of its own.
--
-- ON DELETE SET NULL: groups are soft-deleted (deleted_at) in normal use, so
-- this fires only for a hard delete. When it does, the payment survives and
-- becomes unattributed — the money is real and must not go with the group.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN transactions.group_id IS
  'Which group this income pays for. NULL = the client''s personal process, or unattributed (every row written before migration 0115).';

-- The group card reads "what did this group bring in" and "who in it still
-- owes" by scanning a user''s income for one group. Partial: only the rows
-- that carry a group are ever looked up this way, and they are the minority.
CREATE INDEX IF NOT EXISTS transactions_group_id_idx
  ON transactions (group_id)
  WHERE group_id IS NOT NULL;
