-- ════════════════════════════════════════════════════════════════
-- Migration 0109 — mcp_tokens (טוקנים לקונקטור Claude, עם הרשאה)
-- Date: 2026-08-16
-- ════════════════════════════════════════════════════════════════
-- The Claude connector (supabase/functions/claude-mcp) authenticated against a
-- single environment secret that mapped to one hard-coded user — fine for the
-- feasibility spike, useless for real users, and impossible to scope. This
-- table replaces it: one row per issued token, per user, carrying the one thing
-- the owner decided this stage on —
--
--   scope = 'read'        → the connector may only READ.
--   scope = 'read_write'  → it may also CREATE and EDIT.
--
-- NO DELETE AT ANY SCOPE (owner decision 16/08). Not even the soft kind the app
-- itself uses. A model that misreads an instruction can remove a client or a
-- month of transactions in one call, and "it's restorable from Trash for 30
-- days" is a recovery story, not a permission model. Removing things stays a
-- decision the user makes in the app, with the screen in front of them. The
-- edge function therefore ships no delete tool at all — the scope check is a
-- second line, not the only one.
--
-- WHY THE HASH AND NOT THE TOKEN:
--   token_hash is the SHA-256 hex of the token. The token itself is shown to
--   the user once, at creation, and is never written down anywhere — so this
--   table leaking does not hand anyone a working credential, and neither does a
--   database backup, a support query or a screenshot of the row. It is the same
--   reasoning as a password digest, and the same idiom the invoice webhook uses
--   (token → row → service role).
--
-- WHY NO RLS POLICY:
--   RLS is ON with NO policies, so `anon` and `authenticated` can read nothing
--   here — only the service role, which bypasses RLS, and which is what the
--   edge function runs as. That is deliberate for this stage: nothing in the
--   web app touches this table yet. When the connections-screen UI lands it can
--   add a narrow SELECT-own policy for the metadata (label, scope, last_used_at)
--   as an explicit decision. Minting must stay server-side regardless — a token
--   generated in the browser is a token whose entropy nobody can vouch for.
--
--   ⚠️ The REVOKE below names PUBLIC, not just the two roles. Postgres grants to
--   PUBLIC by default and revoking from anon/authenticated alone changes
--   nothing — the lesson migration 0107 learned the hard way, when an anon
--   probe still returned 204 after the first attempt. Belt and braces: RLS is
--   the real control, the REVOKE means the table is not reachable to begin with.
--
-- Purely additive: one new table. No existing column, constraint or row is
-- touched, so nothing about any current user's data changes on the day this
-- runs. Re-running is a no-op (IF NOT EXISTS throughout).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id           uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid NOT NULL,
  -- SHA-256 hex (64 chars) of the bearer token. Never the token itself.
  token_hash   text NOT NULL,
  -- 'read' is the default on purpose: a token created without anyone thinking
  -- about it is the harmless kind.
  scope        text NOT NULL DEFAULT 'read',
  -- What the user called it ("הלפטופ", "Claude Code בבית") so a revoke list is
  -- readable. Never used for auth.
  label        text,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  -- Stamped by the edge function, throttled to ~5 minutes, so "when did this
  -- token last work" is answerable without a write on every single call.
  last_used_at timestamp with time zone,
  -- Revocation is a timestamp, not a delete: the row stays as the record that
  -- the token existed and when it stopped working.
  revoked_at   timestamp with time zone,
  CONSTRAINT mcp_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT mcp_tokens_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  -- UNIQUE both prevents a collision mapping one token to two users and gives
  -- the auth lookup its index for free — that lookup runs on every request.
  CONSTRAINT mcp_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mcp_tokens_scope_check CHECK (scope = ANY (ARRAY['read'::text, 'read_write'::text]))
);

-- For the future "list / revoke my tokens" screen.
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON public.mcp_tokens (user_id);

ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policy — see the header. Service role only.
REVOKE ALL ON TABLE public.mcp_tokens FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE mcp_tokens IS
  'Bearer tokens for the Claude MCP connector (edge function claude-mcp). Stores the SHA-256 hex of each token, never the token. scope is ''read'' or ''read_write''; no scope permits deletion of anything. RLS is on with no policies: service role only, because minting must not happen in the browser. Created by migration 0109.';

-- ════════════════════════════════════════════════════════════════
-- Issuing a token until the connections-screen UI exists
-- ════════════════════════════════════════════════════════════════
-- Generate the token OUTSIDE the database so the plaintext never reaches a
-- query log, then insert only its digest:
--
--   1. Make a token and its hash locally:
--        node -e "const c=require('crypto');const t=c.randomBytes(32).toString('base64url');console.log('token:',t);console.log('sha256:',c.createHash('sha256').update(t).digest('hex'))"
--
--   2. Insert ONLY the sha256 (never the token):
--        insert into mcp_tokens (user_id, token_hash, scope, label)
--        values ('<user uuid>', '<sha256 hex>', 'read', 'Claude Code');
--
--   3. Give the TOKEN from step 1 to the client, and keep no copy:
--        claude mcp add --transport http simplicity \
--          https://<project>.supabase.co/functions/v1/claude-mcp \
--          --header "Authorization: Bearer <token>"
--
-- To revoke:  update mcp_tokens set revoked_at = now() where id = '<id>';
-- ════════════════════════════════════════════════════════════════
