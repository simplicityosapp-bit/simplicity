-- 0032_user_consent_server_stamp.sql
-- OD-4: make the consent record's RECORDING time server-authoritative.
--
-- Problem: consent rows are inserted by the user's own session, and the client
-- supplies accepted_at — so a user could backdate/forge the moment of
-- acceptance, weakening the table's value as legal evidence.
--
-- Fix: a BEFORE INSERT trigger forces created_at = now(), ignoring any
-- client-supplied value. created_at is therefore a tamper-proof "when this
-- consent was actually recorded on the server" timestamp — the field to rely
-- on in a dispute. We deliberately do NOT override accepted_at, because the
-- append-only sync dedupes on (user_id, kind, accepted_at) via
-- upsert(..., ignoreDuplicates) — overriding it with now() on every insert
-- would defeat that key and spam a new row on every page load. accepted_at
-- stays the (client-supplied) idempotency key; created_at is the evidence.
CREATE OR REPLACE FUNCTION public.user_consent_stamp()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_user_consent_stamp ON public.user_consent;
CREATE TRIGGER trg_user_consent_stamp
  BEFORE INSERT ON public.user_consent
  FOR EACH ROW EXECUTE FUNCTION public.user_consent_stamp();
