/* ════════════════════════════════════════════════════════════════
   CLAUDE ACCESS — master feature switch
   ════════════════════════════════════════════════════════════════
   Personal Claude access (a read-only token for the user's own Claude, scoped
   to the data categories they pick, with a recorded consent) is built in full
   and its backend is live — migration 0109, edge functions claude-mcp and
   mcp-tokens — but it is FROZEN (owner decision 2026-10-11).

   Why it is off: a pasted Bearer token only works in Claude Code. claude.ai,
   the Claude mobile app and Cowork connect through OAuth connectors only, so
   the coaches this is for cannot use it yet.

   Before turning it on:
     1. Stage 2 — an OAuth connector (see apps/web/docs/claude-access.md);
     2. native-speaker review of the en/es/fr strings (claude.consent.*,
        claude.consentTitle, claude.reconsentTitle, claude.agreeCreate,
        claude.revealWarning, claude.errors.consent_required);
     3. legal review of the consent text (connections.json → claude.consent.*).

   While CLAUDE_ACCESS_ENABLED is false:
     • the Connections row shows "בקרוב" with a drawn, non-clickable toggle;
     • /connections/claude redirects back to /connections;
     • useClaudeAccess is never mounted, so no call reaches mcp-tokens.
   → Nothing in the UI reaches the feature while this is false.

   Flip to true (one line) to restore the full behaviour, unchanged. */
export const CLAUDE_ACCESS_ENABLED = false
