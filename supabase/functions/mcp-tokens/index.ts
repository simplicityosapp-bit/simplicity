// ════════════════════════════════════════════════════════════════
//  mcp-tokens — manage the user's personal Claude access token.
// ════════════════════════════════════════════════════════════════
//  STATUS (2026-10-11): DEPLOYED AND ACTIVE on the live project — version 1,
//  verify_jwt ON (a signed-in user's JWT is required). Writes to mcp_tokens
//  (migration 0109, also live). Nothing in the app calls it while
//  CLAUDE_ACCESS_ENABLED (apps/web/src/lib/claudeAccessFlag.js) is false.
//  See apps/web/docs/claude-access.md.
// ════════════════════════════════════════════════════════════════
//  Called by the connections screen (web) with the user's session JWT. The
//  user id is taken ONLY from that verified JWT, never from the request body.
//  Every DB op uses the service-role client (store.ts) and is filtered by that
//  user id. The table (mcp_tokens, migration 0109) is unreachable from the
//  browser.
//
//  Deploy:  supabase functions deploy mcp-tokens        (verify_jwt ON)
//  (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//   injected automatically.)
//
//  Actions (POST { action, ... }):
//    status             { }                               → { status }
//    create             { categories, consent_version }   → { token, url, status }
//                         ← the ONLY response that ever carries the token;
//                           consent_version must equal CONSENT_VERSION
//                           (_shared/mcp-categories.ts) or → consent_required
//    update-categories  { categories, consent_version? }  → { status }
//                         any category outside the consent without the current
//                         consent_version → 409 { error: 'consent_required', missing }
//    renew              { }                               → { status }
//    revoke             { }                               → { status }
//
//  `status` = { active, expired, categories, consented_categories, created_at,
//               expires_at, last_used_at }. Never the hash, never the token.
//
//  Layout: handler.ts (logic, tested), store.ts (the only DB access), this
//  file (wiring). Tests: cd apps/web && npm run test:functions
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleRequest } from './handler.ts'
import { createStore } from './store.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/* Identify the caller from their JWT (anon client + their Authorization). */
async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return null
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await supa.auth.getUser()
  return user?.id ?? null
}

const store = createStore(createClient(SUPABASE_URL, SERVICE_ROLE))
const mcpUrl = `${SUPABASE_URL}/functions/v1/claude-mcp`

Deno.serve((req) => handleRequest(req, { getUserId, store, mcpUrl }))
