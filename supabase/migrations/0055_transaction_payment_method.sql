-- Payment method / "מאיפה הגיע הכסף" on a transaction.
--
-- Until now the payment method existed only transiently — it was passed to the
-- invoice edge function when issuing a receipt (PAY_METHODS in lib/invoiceDocs.js)
-- and never stored on the transaction itself. Coaches who track HOW each payment
-- came in (and importers carrying a "אמצעי תשלום" column) had nowhere to put it.
--
-- Constrained to the same key set the receipt picker already uses, so the stored
-- value round-trips to the issue flow without a second mapping. NULL = not set
-- (the field is optional everywhere). Additive + nullable — existing rows are
-- untouched and keep NULL.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method text
  CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer', 'cash', 'credit_card', 'app', 'other'));

COMMENT ON COLUMN transactions.payment_method IS
  'How the money moved: bank_transfer | cash | credit_card | app (Bit/PayBox) | other | NULL (not set). Same key set as lib/invoiceDocs.js PAY_METHODS.';
