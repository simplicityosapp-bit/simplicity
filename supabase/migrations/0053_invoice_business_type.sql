-- Business type for the connected invoice provider (BYOK invoice integration).
--
-- Drives the document-type picker: a VAT-exempt עוסק פטור can ONLY issue a
-- receipt (קבלה) — issuing a tax invoice / חשבונית מס/קבלה fails at Green Invoice
-- with errorCode 2403 ("not supported for this business type"). The user sets
-- this once on the Connections screen; the picker then defaults/filters to the
-- document types their business can actually issue.
--
-- Nullable: NULL = not chosen yet (the UI prompts, and the picker keeps the
-- default behaviour until set). Additive + nullable — existing rows untouched.
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS business_type text
  CHECK (business_type IS NULL OR business_type IN ('exempt', 'licensed'));

COMMENT ON COLUMN user_integrations.business_type IS
  'Invoice business type: exempt (עוסק פטור — receipt only) | licensed (עוסק מורשה — all doc types) | NULL (not set). Drives the issue doc-type picker.';
