-- 0045_security_advisor_fixes.sql
-- Resolve Supabase Security Advisor "Function Search Path Mutable" and
-- "Public/Signed-In Users Can Execute SECURITY DEFINER Function" findings.
--
-- Scope: hardening only. No behavior change, no data change.
--
--   1) set_updated_at / user_consent_stamp — pin an empty search_path so the
--      functions can't be tricked into resolving now() (or any other name)
--      against an attacker-controlled schema. Both only touch NEW.* and now()
--      (now() lives in pg_catalog, which is always implicitly searched), so
--      search_path = '' is fully safe.
--
--   2) rls_auto_enable() — an EVENT TRIGGER function. It is invoked only by
--      Postgres' DDL-event machinery, never by a direct SELECT, so granting
--      EXECUTE to PUBLIC buys nothing. Revoke it to clear the advisor finding.
--      (pg_net "Extension in Public" and Auth "Leaked Password Protection" are
--       handled outside SQL — see the security review notes.)

-- ── 1) Pin search_path on the two trigger functions ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.user_consent_stamp()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $function$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$function$;

-- ── 2) Lock down the event-trigger function ──────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

NOTIFY pgrst, 'reload schema';
