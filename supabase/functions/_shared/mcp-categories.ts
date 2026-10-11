// ════════════════════════════════════════════════════════════════
//  Claude personal access — the approved data categories.
// ════════════════════════════════════════════════════════════════
//  SINGLE SOURCE for the edge functions: imported by both mcp-tokens (which
//  validates what the user picks) and claude-mcp (which enforces it on every
//  request). `_shared` is not a function itself; the CLI bundles it into each
//  function that imports it (same mechanism invoice-webhook uses for
//  ../invoices/providers.ts).
//
//  Mirrored, deliberately, in two places that cannot import this file:
//    - the CHECK constraint in supabase/migrations/0109_mcp_tokens.sql
//    - the connections UI (labels/descriptions via i18n)
//  Both are guarded by a test that compares their key lists to this one.
//  Adding a category = this file + a migration widening the CHECK + the UI.
// ════════════════════════════════════════════════════════════════

export const MCP_CATEGORIES = [
  'clients',          // לקוחות וקבוצות
  'contact_details',  // פרטי קשר מזהים (רגיש)
  'session_notes',    // הערות פגישות (רגיש)
  'client_notes',     // הערות חופשיות על לקוחות ולידים (רגיש)
  'meetings',         // פגישות ויומן (אירועים חיצוניים כזמן תפוס בלבד)
  'calendar_titles',  // כותרות אירועי יומן (רגיש)
  'leads',            // לידים
  'finance',          // כספים
  'tax_ids',          // ת"ז / ח.פ. (רגיש)
  'tasks',            // משימות ותזכורות
  'projects_goals',   // פרויקטים ויעדים
  'journal',          // יומן אישי (רגיש)
] as const

export type McpCategory = typeof MCP_CATEGORIES[number]

export const SENSITIVE_CATEGORIES: ReadonlySet<McpCategory> = new Set<McpCategory>([
  'contact_details',
  'session_notes',
  'client_notes',
  'calendar_titles',
  'tax_ids',
  'journal',
])

// What each category covers, for the connector's get_access_info (so Claude can
// tell the user which box to tick). The UI has its own Hebrew copy via i18n.
export const CATEGORY_INFO: Record<McpCategory, { label_he: string; covers: string }> = {
  clients:         { label_he: 'לקוחות וקבוצות', covers: 'Client and group names, status, pricing, schedule. No contact details or notes.' },
  contact_details: { label_he: 'פרטי קשר מזהים', covers: 'Phone, email, address, birth date of clients; lead and booking contact details; invoice recipient contact details.' },
  session_notes:   { label_he: 'הערות פגישות', covers: 'Notes and summaries written on sessions.' },
  client_notes:    { label_he: 'הערות על לקוחות ולידים', covers: 'Free-text notes on clients and leads.' },
  meetings:        { label_he: 'פגישות ויומן', covers: 'Past sessions, scheduled meetings, bookings, meeting types; external calendar events as busy time only.' },
  calendar_titles: { label_he: 'כותרות אירועי יומן', covers: 'Titles of external calendar events.' },
  leads:           { label_he: 'לידים', covers: 'Lead names, status, source and dates. No contact details or notes.' },
  finance:         { label_he: 'כספים', covers: 'Transactions, categories, payment plans and installments, recurring items, adjustments, investments. Client ids, not names.' },
  tax_ids:         { label_he: 'ת"ז / ח.פ.', covers: 'Tax id of invoice recipients.' },
  tasks:           { label_he: 'משימות ותזכורות', covers: 'Tasks (including descriptions) and reminders.' },
  projects_goals:  { label_he: 'פרויקטים ויעדים', covers: 'Projects, goals and goal progress entries.' },
  journal:         { label_he: 'יומן אישי', covers: 'Personal answers, reflections and Moon scores.' },
}

// Version of the consent text the user must agree to before a token is
// created (connections.json → claude.consent.*). mcp-tokens rejects a create
// that does not carry exactly this value, and stores it on the token row.
// Bump it whenever the consent wording changes; the UI mirrors it in
// apps/web/src/lib/claudeAccess.js (guarded by a test).
export const CONSENT_VERSION = '2026-10-11'

// Token lifetime on create and on renew. The column default in 0109 matches.
export const TOKEN_TTL_DAYS = 90

const KNOWN: ReadonlySet<string> = new Set(MCP_CATEGORIES)

/* Validate untrusted input. Returns a de-duplicated list in canonical order,
   or null if it is not a non-empty array of known category keys. Unknown keys
   reject the whole request rather than being silently dropped. */
export function parseCategories(input: unknown): McpCategory[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) return null
  if (!input.every((c) => typeof c === 'string' && KNOWN.has(c))) return null
  const picked = new Set(input as string[])
  return MCP_CATEGORIES.filter((c) => picked.has(c))
}
