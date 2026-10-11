-- ════════════════════════════════════════════════════════════════
-- Migration 0109 — mcp_tokens (גישה אישית ל-Claude: טוקן קריאה בלבד + קטגוריות)
-- Date: 2026-08-16, rewritten 2026-10-11 (never applied before the rewrite —
--       verified against the live DB 2026-10-11: no table, no migration row)
-- ════════════════════════════════════════════════════════════════
-- One row per personal-access token for the Claude connector
-- (supabase/functions/claude-mcp). Tokens are minted and managed by the
-- edge function mcp-tokens on behalf of the signed-in user; the web app never
-- touches this table directly.
--
-- WHAT THE OWNER DECIDED (11/10/2026):
--   - READ ONLY. There is no scope column: no write, edit or delete capability
--     exists at any level, so there is nothing to grant.
--   - ONE ACTIVE TOKEN PER USER. "Switch on" = there is an active row; "switch
--     off" = every row of that user has revoked_at set. Enforced by the partial
--     unique index below, not just by the function.
--   - DATA CATEGORIES ARE OPT-IN. `categories` lists what Claude may read.
--     Nothing is preselected and a token cannot exist with an empty list
--     (CHECK below). The connector reads this column from the DB on EVERY
--     request, so changing it takes effect immediately, without a new token.
--   - EXPIRY. expires_at defaults to 90 days from creation. "Renew" moves it
--     another 90 days forward on the SAME row/token.
--   - CONSENT. Every token records which version of the consent text the user
--     agreed to (consent_version) and when (consented_at, first_consented_at),
--     written in the same transaction that creates the token
--     (mcp_token_issue) — so no token can exist without a consent record.
--     consented_categories lists every category consented to; `categories`
--     must always be a subset of it (CHECK). Adding any category outside it
--     needs a fresh consent (mcp_token_update_categories); it only grows and
--     first_consented_at never changes (trigger). Renew does not touch consent.
--     Rows are kept on revoke, so the consent history survives switching off;
--     it is deleted with the account (FK ON DELETE CASCADE).
--
-- The category keys are mirrored in the edge functions (claude-mcp, mcp-tokens)
-- and in the connections UI. Adding a category = a new migration that widens
-- the CHECK, plus the code.
--
-- WHY THE HASH AND NOT THE TOKEN:
--   token_hash is the SHA-256 hex of the token. The token itself is shown to
--   the user once, at creation, and never stored — so this table leaking, a
--   backup or a support query does not hand anyone a working credential.
--
-- WHY NO RLS POLICY:
--   RLS is ON with NO policies, and everything is revoked from PUBLIC, anon and
--   authenticated: only the service role (the edge functions) can reach it.
--   Minting must stay server-side — a token generated in the browser is a
--   token whose entropy nobody can vouch for. The REVOKE names PUBLIC on
--   purpose (lesson of migration 0107).
--
-- DATA SAFETY: purely additive — one new table, its trigger, and three new
-- functions (mcp_tokens_consent_guard, mcp_token_issue,
-- mcp_token_update_categories); no existing column, constraint or row is
-- touched.
-- Re-running is a no-op (IF NOT EXISTS / CREATE OR REPLACE throughout).
-- ⚠️ After it is run, regenerate supabase/schema.sql from the live DB.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id           uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid NOT NULL,
  -- SHA-256 hex (64 chars) of the bearer token. Never the token itself.
  token_hash   text NOT NULL,
  -- Optional name shown in the UI. Never used for auth.
  label        text,
  -- What Claude may read. Opt-in, at least one, known keys only.
  categories   text[] NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  expires_at   timestamp with time zone DEFAULT (now() + interval '90 days') NOT NULL,
  -- Consent (see header). consent_version / consented_at = the LATEST consent;
  -- first_consented_at = the consent given when the token was created, never
  -- changed; consented_categories = every category the user has consented to
  -- on this token — only ever grows, and always covers `categories`.
  consent_version text NOT NULL,
  consented_at timestamp with time zone DEFAULT now() NOT NULL,
  first_consented_at timestamp with time zone DEFAULT now() NOT NULL,
  consented_categories text[] NOT NULL,
  -- Stamped by claude-mcp, throttled to ~5 minutes.
  last_used_at timestamp with time zone,
  -- Revocation is a timestamp, not a delete: the row stays as the record that
  -- the token existed and when it stopped working.
  revoked_at   timestamp with time zone,
  CONSTRAINT mcp_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT mcp_tokens_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Prevents one token mapping to two users, and indexes the per-request lookup.
  CONSTRAINT mcp_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mcp_tokens_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mcp_tokens_categories_check CHECK (
    cardinality(categories) >= 1
    AND categories <@ ARRAY[
      'clients',          -- לקוחות וקבוצות
      'contact_details',  -- פרטי קשר מזהים (רגיש)
      'session_notes',    -- הערות פגישות (רגיש)
      'client_notes',     -- הערות חופשיות על לקוחות ולידים (רגיש)
      'meetings',         -- פגישות ויומן (אירועים חיצוניים כזמן תפוס בלבד)
      'calendar_titles',  -- כותרות אירועי יומן (רגיש)
      'leads',            -- לידים
      'finance',          -- כספים
      'tax_ids',          -- ת"ז / ח.פ. (רגיש)
      'tasks',            -- משימות ותזכורות
      'projects_goals',   -- פרויקטים ויעדים
      'journal'           -- יומן אישי (רגיש)
    ]::text[]
  ),
  CONSTRAINT mcp_tokens_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT mcp_tokens_consent_version_check CHECK (length(consent_version) BETWEEN 1 AND 32),
  -- Claude can never be allowed a category the user did not consent to: the
  -- DB rejects it even if the function code were wrong.
  CONSTRAINT mcp_tokens_categories_consented CHECK (categories <@ consented_categories)
);

-- consented_categories only grows, and first_consented_at never changes.
-- A trigger, because a CHECK cannot see the old row.
CREATE OR REPLACE FUNCTION public.mcp_tokens_consent_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.first_consented_at IS DISTINCT FROM OLD.first_consented_at THEN
    RAISE EXCEPTION 'mcp_tokens_first_consented_at_immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (OLD.consented_categories <@ NEW.consented_categories) THEN
    RAISE EXCEPTION 'mcp_tokens_consented_categories_shrink' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_tokens_consent_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_tokens_consent_guard() TO service_role;

DROP TRIGGER IF EXISTS trg_mcp_tokens_consent_guard ON public.mcp_tokens;
CREATE TRIGGER trg_mcp_tokens_consent_guard
  BEFORE UPDATE ON public.mcp_tokens
  FOR EACH ROW EXECUTE FUNCTION public.mcp_tokens_consent_guard();

-- One active (not revoked) token per user. Expired-but-not-revoked rows still
-- count, so creating a new token always revokes the old row first.
CREATE UNIQUE INDEX IF NOT EXISTS mcp_tokens_one_active_per_user
  ON public.mcp_tokens (user_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON public.mcp_tokens (user_id);

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policy — see the header. Service role only.
REVOKE ALL ON TABLE public.mcp_tokens FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.mcp_tokens IS
  'Personal read-only access tokens for the Claude MCP connector (edge function claude-mcp), managed by edge function mcp-tokens. Stores the SHA-256 hex of each token, never the token. categories = opt-in data categories, read on every request. One active token per user. RLS on with no policies: service role only. Created by migration 0109.';

-- ════════════════════════════════════════════════════════════════
-- mcp_token_issue — create a token, atomically replacing the previous one
-- ════════════════════════════════════════════════════════════════
-- "Revoke the old row + insert the new one" must never half-happen: a failure
-- between the two would leave the user with no token, and doing them in the
-- wrong order trips the one-active-per-user index. A function call is one
-- transaction, so both statements commit together or not at all.
--
--   - pg_advisory_xact_lock serialises concurrent creates for the same user
--     (two taps on "create"), so neither of them hits the unique index.
--   - Creation rate limit lives here, not only in the edge function's
--     in-memory limiter (which is per isolate and resets): at most 5 tokens
--     per user per rolling hour, counted from the rows themselves (revoked
--     rows are kept, so they count).
--   - The caller (edge function mcp-tokens, service role) passes the hash and
--     the user id it took from the verified JWT. The token itself never
--     reaches the database.
--   - The consent version (validated by mcp-tokens against the current text)
--     is stored in the same INSERT, with consented_at = now().
--   - SECURITY INVOKER + EXECUTE for service_role only: it is not callable
--     from the browser, and it runs with the caller's (service role's) rights.
CREATE OR REPLACE FUNCTION public.mcp_token_issue(
  p_user            uuid,
  p_token_hash      text,
  p_categories      text[],
  p_consent_version text,
  p_label           text DEFAULT NULL
)
RETURNS TABLE (id uuid, created_at timestamp with time zone, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mcp_tokens:' || p_user::text, 0));

  IF (SELECT count(*) FROM public.mcp_tokens t
       WHERE t.user_id = p_user
         AND t.created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'mcp_token_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.mcp_tokens t
     SET revoked_at = now()
   WHERE t.user_id = p_user
     AND t.revoked_at IS NULL;

  RETURN QUERY
    INSERT INTO public.mcp_tokens AS t
      (user_id, token_hash, categories, consent_version, consented_at, first_consented_at, consented_categories, label)
    VALUES
      (p_user, p_token_hash, p_categories, p_consent_version, now(), now(), p_categories, p_label)
    RETURNING t.id, t.created_at, t.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_token_issue(uuid, text, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_token_issue(uuid, text, text[], text, text) TO service_role;

-- ════════════════════════════════════════════════════════════════
-- mcp_token_update_categories — change what Claude may read, atomically
-- ════════════════════════════════════════════════════════════════
-- One rule (owner decision): any category in the new selection that is NOT
-- in consented_categories needs a fresh consent — sensitive or not. Removing
-- categories, or choosing again among already-consented ones, needs none.
--
--   - p_consent_version is passed by mcp-tokens ONLY when the request carried
--     the current consent version; otherwise NULL.
--   - Missing categories + no consent → result 'consent_required' with the
--     missing keys; nothing is written.
--   - Missing categories + consent → ONE update: categories, the grown
--     consented_categories, consent_version, consented_at = now().
--     first_consented_at is untouched (and the trigger forbids changing it).
--   - Nothing missing → only categories change; the consent record does not,
--     even if the token's consent_version is an older text.
--   - The active row is locked (FOR UPDATE) for the whole call.
CREATE OR REPLACE FUNCTION public.mcp_token_update_categories(
  p_user            uuid,
  p_categories      text[],
  p_consent_version text DEFAULT NULL
)
RETURNS TABLE (
  result               text,
  missing              text[],
  categories           text[],
  consented_categories text[],
  created_at           timestamp with time zone,
  expires_at           timestamp with time zone,
  last_used_at         timestamp with time zone
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  r         public.mcp_tokens%ROWTYPE;
  v_missing text[];
BEGIN
  SELECT * INTO r FROM public.mcp_tokens t
   WHERE t.user_id = p_user AND t.revoked_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_active_token'::text, NULL::text[], NULL::text[], NULL::text[],
                        NULL::timestamptz, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  v_missing := ARRAY(
    SELECT DISTINCT c FROM unnest(p_categories) AS c
     WHERE NOT (c = ANY (r.consented_categories))
     ORDER BY 1
  );

  IF cardinality(v_missing) > 0 AND p_consent_version IS NULL THEN
    RETURN QUERY SELECT 'consent_required'::text, v_missing, r.categories, r.consented_categories,
                        r.created_at, r.expires_at, r.last_used_at;
    RETURN;
  END IF;

  IF cardinality(v_missing) > 0 THEN
    UPDATE public.mcp_tokens t
       SET categories = p_categories,
           consented_categories = r.consented_categories || v_missing,
           consent_version = p_consent_version,
           consented_at = now()
     WHERE t.id = r.id
     RETURNING * INTO r;
  ELSE
    UPDATE public.mcp_tokens t
       SET categories = p_categories
     WHERE t.id = r.id
     RETURNING * INTO r;
  END IF;

  RETURN QUERY SELECT 'ok'::text, ARRAY[]::text[], r.categories, r.consented_categories,
                      r.created_at, r.expires_at, r.last_used_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_token_update_categories(uuid, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_token_update_categories(uuid, text[], text) TO service_role;
