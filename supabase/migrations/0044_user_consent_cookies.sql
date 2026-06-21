-- 0044_user_consent_cookies.sql
-- The public cookie banner (accept / reject) records the visitor's choice. For
-- a logged-in user that choice is mirrored into the durable, append-only
-- user_consent record (alongside privacy / dpa / terms / marketing). Extend the
-- kind whitelist to allow the new 'cookies' kind. Idempotent and additive:
-- drops the inline CHECK (auto-named user_consent_kind_check) and re-adds it
-- with 'cookies'. No data is read, modified, or removed — existing rows are
-- untouched.
ALTER TABLE user_consent DROP CONSTRAINT IF EXISTS user_consent_kind_check;
ALTER TABLE user_consent ADD CONSTRAINT user_consent_kind_check
  CHECK (kind IN ('privacy','dpa','marketing','terms','cookies'));
