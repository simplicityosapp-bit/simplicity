-- ════════════════════════════════════════════════════════════════
-- Migration 0043 — meeting types (per-user) + client price linkage
-- Date: 2026-06-21
-- ════════════════════════════════════════════════════════════════
-- Background
--   Coaches want to label each client by HOW they meet (physical /
--   online / …) and attach a default price to each meeting type, so a
--   client's per-session price can follow the type automatically. They
--   must be able to add their own types beyond the seeded defaults.
--
--   This mirrors the lead_sources / task_statuses pattern: a per-user
--   list table with RLS, a nullable FK on clients, and a soft-delete
--   window. The price the type carries is copied onto the client's
--   existing price_per_session column (the whole billing engine already
--   reads price_per_session — see src/lib/clients.js — so nothing
--   downstream changes). Live propagation: when a type's default_price
--   changes, the app updates every linked client that hasn't been
--   manually overridden (price_overridden = false).
--
-- Additive + data-preserving
--   One new table + two nullable/defaulted columns on clients. No column
--   is dropped or rewritten. Existing clients get meeting_type_id = NULL
--   (no type attached → nothing propagates to them) and
--   price_overridden = false, so their stored price_per_session is left
--   exactly as-is. Re-running is a no-op (IF NOT EXISTS / DROP-then-CREATE
--   on policies + triggers; seeding guarded by NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

-- ── Table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  default_price numeric,                                  -- NULL = no preset price
  color         text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- ── clients: link + manual-override flag ────────────────────────
-- meeting_type_id: ON DELETE SET NULL keeps the client when a type is
--   hard-deleted. price_overridden: true once the user edits the
--   client's price by hand, which detaches it from the type so a later
--   type-price change never clobbers a deliberate manual price.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS meeting_type_id  uuid REFERENCES meeting_types(id) ON DELETE SET NULL;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS price_overridden boolean NOT NULL DEFAULT false;

-- ── Row Level Security (own-row only, like lead_sources) ────────
ALTER TABLE meeting_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_types_own ON meeting_types;
CREATE POLICY meeting_types_own ON meeting_types
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── updated_at trigger ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_meeting_types_updated ON meeting_types;
CREATE TRIGGER trg_meeting_types_updated BEFORE UPDATE ON meeting_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meeting_types_user      ON meeting_types (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_meeting_type_id ON clients (meeting_type_id);

-- ── Seed defaults per existing user (modality only — no price) ──
-- Guarded by NOT EXISTS so re-running never duplicates. default_price is
-- left NULL: the user sets prices later; nothing auto-changes a client.
INSERT INTO meeting_types (user_id, name, sort_order)
SELECT u.id, 'פיזית', 0 FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM meeting_types m
  WHERE m.user_id = u.id AND m.name = 'פיזית' AND m.deleted_at IS NULL
);

INSERT INTO meeting_types (user_id, name, sort_order)
SELECT u.id, 'אונליין', 1 FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM meeting_types m
  WHERE m.user_id = u.id AND m.name = 'אונליין' AND m.deleted_at IS NULL
);
