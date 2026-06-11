-- 0026_clients_email.sql
-- Add a plaintext `email` column to clients, for the upcoming invoicing
-- integrations (Green Invoice / SUMIT) which read contact details directly.
-- Nullable + additive → no data change, no backfill. Intentionally NOT
-- encrypted (a basic contact detail, like `name` and `phone`).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email text;
