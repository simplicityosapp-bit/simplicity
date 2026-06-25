-- 0063 — ad-hoc receipt recipient (issue a receipt for a non-client).
-- A coach can issue a receipt to someone who isn't (yet) a client by filling
-- the recipient details on the income transaction itself. All columns are
-- nullable, so every existing row keeps NULL (no data migration / no DROP).
-- The normal client-linked flow is unchanged: these stay NULL when client_id
-- is set. (beta feedback 25/06)

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recipient_name  text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recipient_email text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recipient_phone text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recipient_tax_id text;
