-- 0029_user_consent.sql
-- Durable, APPEND-ONLY legal record of every consent acceptance. Consent is
-- also kept in auth.users user_metadata (used for signup / re-acceptance
-- gating), but that single mutable field can be lost (a failed client-side
-- write on the Google OAuth path) and is not an audit trail. This table is the
-- legal source of truth: one immutable row per acceptance.
CREATE TABLE IF NOT EXISTS user_consent (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('privacy','dpa','marketing')),
  version     text,                          -- privacy/dpa policy version; NULL for marketing
  accepted    boolean NOT NULL DEFAULT true, -- marketing: true = opted in, false = opted out
  source      text,                          -- email_signup | google_oauth | reacceptance | backfill
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One row per (user, kind, moment): makes the per-load sync idempotent, and
  -- still allows a NEW row when the user re-accepts a new version (new accepted_at).
  CONSTRAINT user_consent_uniq UNIQUE (user_id, kind, accepted_at)
);

ALTER TABLE user_consent ENABLE ROW LEVEL SECURITY;
-- Append-only for the user: INSERT + SELECT their own rows, but NO update/delete,
-- so a recorded consent can't be tampered with. Admin reads via service-role.
CREATE POLICY user_consent_insert ON user_consent FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY user_consent_select ON user_consent FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_consent_user ON user_consent (user_id);
