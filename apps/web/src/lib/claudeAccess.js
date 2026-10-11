/* ════════════════════════════════════════════════════════════════
   CLAUDE ACCESS — the data categories as the UI shows them.
   ════════════════════════════════════════════════════════════════
   The source of truth is supabase/functions/_shared/mcp-categories.ts (the
   edge functions import it). The browser cannot import that file, so the keys
   are mirrored here — test/claude-access-categories.test.js fails if this list
   drifts from it or from the CHECK constraint in migration 0109.

   Labels and descriptions live in i18n: connections.json → claude.cats.<key>.
   `sensitive` and `freeText` only drive badges; enforcement is server-side. */
export const CLAUDE_CATEGORIES = [
  { key: 'clients' },
  { key: 'contact_details', sensitive: true },
  { key: 'session_notes', sensitive: true },
  { key: 'client_notes', sensitive: true },
  { key: 'meetings' },
  { key: 'calendar_titles', sensitive: true },
  { key: 'leads', freeText: true },
  { key: 'finance', freeText: true },
  { key: 'tax_ids', sensitive: true },
  { key: 'tasks', freeText: true },
  { key: 'projects_goals' },
  { key: 'journal', sensitive: true },
]

/* Version of the consent text in connections.json → claude.consent.*. Sent
   with create; the server stores it on the token row and rejects any other
   value (consent_required). Mirrors CONSENT_VERSION in
   supabase/functions/_shared/mcp-categories.ts — bump BOTH whenever the
   consent wording changes (a test fails if they differ). */
export const CLAUDE_CONSENT_VERSION = '2026-10-11'

/* The consent text, built from what the user actually picked: what Claude will
   read, that client data goes to Claude (Anthropic) for processing, a line for
   free text and one for sensitive categories when any is picked,
   responsibility, and that access can be switched off at any time.
   `t` is the connections-namespace translator from useT (gendered). */
export function consentLines(keys, t, lang) {
  const names = (pred) => keys
    .filter((k) => pred(CLAUDE_CATEGORIES.find((c) => c.key === k)))
    .map((k) => t(`claude.cats.${k}.name`))
  const list = (arr) => {
    try { return new Intl.ListFormat(lang || 'he', { type: 'conjunction' }).format(arr) } catch { return arr.join(', ') }
  }
  const sensitive = names((c) => c?.sensitive)
  return [
    t('claude.consent.reads', { list: list(names(() => true)) }),
    t('claude.consent.transfer'),
    ...(names((c) => c?.freeText).length ? [t('claude.consent.freeText')] : []),
    ...(sensitive.length ? [t('claude.consent.sensitive', { list: list(sensitive) })] : []),
    t('claude.consent.responsibility'),
    t('claude.consent.revoke'),
  ]
}

/* Categories in `selected` the user has not consented to on this token. Any
   such category — sensitive or not — needs the consent text + checkbox again
   before saving (the server enforces the same rule). */
export const categoriesNeedingConsent = (selected, consented) =>
  selected.filter((k) => !(consented ?? []).includes(k))

/* The one-time setup command shown with the new token. */
export function claudeConnectCommand(url, token) {
  return `claude mcp add --transport http simplicity ${url} --header "Authorization: Bearer ${token}"`
}

/* Error codes from the mcp-tokens function that have their own sentence
   (connections.json → claude.errors.<code>); anything else → 'unknown'. */
export const CLAUDE_ERROR_CODES = ['unauthorized', 'rate_limited', 'invalid_categories', 'consent_required', 'no_active_token', 'server_error', 'network']
export const claudeErrorKey = (code) => `claude.errors.${CLAUDE_ERROR_CODES.includes(code) ? code : 'unknown'}`
