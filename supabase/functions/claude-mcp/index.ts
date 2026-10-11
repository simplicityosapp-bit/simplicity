// ════════════════════════════════════════════════════════════════
//  claude-mcp — remote MCP server (Streamable HTTP) for the user's own Claude.
//  Read-only access to the user's Simplicity data, limited to the data
//  categories they enabled in the app (Connections → Claude).
// ════════════════════════════════════════════════════════════════
//  Auth is a personal bearer token (`smp_…`) managed by the edge function
//  mcp-tokens and stored as a SHA-256 hash in `mcp_tokens` (migration 0109).
//  It is NOT a Supabase JWT, so the gateway JWT check must be OFF:
//
//      supabase functions deploy claude-mcp --no-verify-jwt
//
//  (There is no supabase/config.toml in this repo; the flag above — or
//   verify_jwt:false when deploying via the API/MCP — is the setting.)
//
//  Connect (Claude Code):
//      claude mcp add --transport http simplicity \
//        https://<project>.supabase.co/functions/v1/claude-mcp \
//        --header "Authorization: Bearer <token>"
//
//  Layout:
//    server.ts — auth, JSON-RPC, category enforcement, dispatch (see its
//                header for the full security model)
//    tools.ts  — the read-only tool catalogue and column allowlists
//    db.ts     — the ONLY file that queries the database
//    tests/    — run with: cd apps/web && npx vitest run --config ../../supabase/functions/vitest.config.mjs
// ════════════════════════════════════════════════════════════════
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createDb } from './db.ts'
import { handleRequest } from './server.ts'

const db = createDb(createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
))

Deno.serve((req) => handleRequest(req, { db }))
