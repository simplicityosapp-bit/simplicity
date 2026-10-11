# Personal Claude access — status & how to resume

**Status: built in full, backend live, UI frozen behind a master lock (`CLAUDE_ACCESS_ENABLED=false`). The Connections row shows "בקרוב" and `/connections/claude` redirects; nothing in the app calls the backend. Frozen because a pasted Bearer token only works in Claude Code — claude.ai, the Claude mobile app and Cowork need an OAuth connector.**
Last updated: 2026-10-11.

## What it is
A coach can let their own Claude read — and only read — their Simplicity data, limited to the data categories they choose, after agreeing to a consent text. They get a personal token (shown once) and connect Claude Code with:

```
claude mcp add --transport http simplicity <URL>/functions/v1/claude-mcp --header "Authorization: Bearer <TOKEN>"
```

## What is built
- **Migration `0109_mcp_tokens`** — table `mcp_tokens`: per-user token stored only as a SHA-256 hash, opt-in `categories`, 90-day expiry (renewable), one active token per user, and a consent record (`consent_version`, `consented_at`, `first_consented_at`, `consented_categories`). The DB itself enforces: categories ⊆ consented categories, consent only grows, the first consent never changes. Functions `mcp_token_issue` (atomic replace + consent) and `mcp_token_update_categories` (any category outside the consent needs a fresh consent). RLS on, no policies — service role only.
- **Edge function `claude-mcp`** (`supabase/functions/claude-mcp/`) — the MCP server. Every request re-reads the token (no cache), so revoke/category changes apply on the next call. 22 read-only tools in 12 categories (6 sensitive); `tools/list` and `tools/call` both enforce categories; one data door (`db.readRows`) that always filters by the token's user, excludes Trash, selects only allowlisted columns and caps at 200 rows. No write tool.
- **Edge function `mcp-tokens`** — create / status / update-categories / renew / revoke for the signed-in user. Requires the current consent version to create, and again to add a category.
- **Web UI** — `screens/connections/ClaudeConnection.jsx`, `hooks/useClaudeAccess.js`, `lib/claudeAccess.js`, i18n `connections.json → claude.*` in he/en/es/fr (Hebrew gendered via `useT`).
- Category list single source: `supabase/functions/_shared/mcp-categories.ts` (mirrored in the migration CHECK and the UI, guarded by tests).

## What is deployed (live project `rdurkakzyymxhocvhufw`)
| Piece | State |
|---|---|
| Migration 0109 | applied 2026-10-11, recorded `20261011070819 0109_mcp_tokens` |
| `claude-mcp` | v1, ACTIVE, `verify_jwt` off (own token auth) |
| `mcp-tokens` | v1, ACTIVE, `verify_jwt` on |
| `mcp_tokens` rows | 1, revoked 2026-10-11 (the owner's production test token) — kept as a record |

The code headers of both functions were updated after deploy (status comments only); the deployed v1 does not carry them. Redeploying is not needed for behaviour.

## What was verified live (2026-10-11)
- Migration objects, grants (no access for anon/authenticated/PUBLIC), advisor (only the expected `rls_enabled_no_policy`), no column ambiguity in either function.
- Smoke tests: generic 401 from our code for missing / unknown / malformed tokens and for a Supabase JWT; 403 for browser Origin; gateway 401 on `mcp-tokens` without a JWT.
- Isolation with two throw-away test users: each sees only its own rows; other users' ids return nothing; tools outside the token's categories refused even when called directly; calendar events are busy time only without the titles category; no forbidden field in any output; all 22 tools run against the live schema (including `desc` in `list_transactions` / `get_finance_summary`); revoked, expired and replaced tokens refused; both re-consent branches. All test users and rows removed afterwards (0 rows left in 63 referencing tables).

## Master lock — `src/lib/claudeAccessFlag.js`
`export const CLAUDE_ACCESS_ENABLED = false`. While false: Claude is the old "בקרוב" row with a drawn, non-clickable toggle; `/connections/claude` redirects to `/connections`; `useClaudeAccess` never mounts, so no call reaches `mcp-tokens`. Covered by `test/claude-access-flag.test.jsx` (both states).

## To resume
1. **Stage 2 — OAuth connector**, so claude.ai, the mobile app and Cowork can connect (the token table, categories, consent and read tools are meant to be shared by both paths).
2. **Native-speaker review** of en/es/fr: `claude.consent.*`, `claude.consentTitle`, `claude.reconsentTitle`, `claude.agreeCreate`, `claude.revealWarning`, `claude.errors.consent_required`.
3. **Legal review** of the consent text (`connections.json → claude.consent.*`). If the wording changes, bump `CONSENT_VERSION` in `_shared/mcp-categories.ts` **and** `CLAUDE_CONSENT_VERSION` in `lib/claudeAccess.js` (a test keeps them equal), then redeploy both functions.
4. **Turn the flag on** — `CLAUDE_ACCESS_ENABLED = true` (one line) and update the "shipped flag is off" assertion in `test/claude-access-flag.test.jsx`.
5. Run everything (`npm test`, `npm run test:functions`, lint, build, deno check), then merge to `main`.

## Tests
- `npm test` (apps/web) — includes `claude-access-categories`, `claude-access-flag`, and `claude-access-migration` (runs 0109 on in-memory Postgres via PGlite).
- `npm run test:functions` — `claude-mcp` / `mcp-tokens` end to end against fakes, plus static guards.
- `npm run test:db` — the migration test alone.
