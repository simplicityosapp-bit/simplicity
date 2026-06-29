-- 0065_clients_birth_date.sql
-- Add a plaintext `birth_date` column to clients. Requested alongside the
-- address field — both live behind a collapsible "more details" toggle.
--
-- Intentionally NOT encrypted: stored plaintext like name/phone/email/address
-- (field-level encryption was removed 2026-06; at-rest protection = RLS account
-- isolation + HTTPS). Birth date is optional, owner-approved 2026-06-25, and
-- disclosed in the privacy policy (end-client data list, PRIVACY_VERSION 2.2).
--
-- Additive, nullable, IF NOT EXISTS → no backfill, no data change, no DROP.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS birth_date date;

NOTIFY pgrst, 'reload schema';
