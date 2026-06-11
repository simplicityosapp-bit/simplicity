-- 0030_user_consent_terms.sql
-- Terms-of-Service consent is now captured at signup (a separate required
-- checkbox) and on re-acceptance. Extend the user_consent.kind whitelist to
-- allow the new 'terms' kind so the durable, append-only legal record can store
-- it alongside privacy / dpa / marketing. Idempotent: drops the old inline
-- CHECK (auto-named user_consent_kind_check) and re-adds it with 'terms'.
ALTER TABLE user_consent DROP CONSTRAINT IF EXISTS user_consent_kind_check;
ALTER TABLE user_consent ADD CONSTRAINT user_consent_kind_check
  CHECK (kind IN ('privacy','dpa','marketing','terms'));
