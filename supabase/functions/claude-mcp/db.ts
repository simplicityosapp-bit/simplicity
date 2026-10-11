// ════════════════════════════════════════════════════════════════
//  claude-mcp / db.ts — THE ONLY FILE THAT TOUCHES THE DATABASE.
// ════════════════════════════════════════════════════════════════
//  Every query the connector makes is built here. Nothing else in claude-mcp
//  may call `.from(` / `.rpc(` / `.schema(` — a test (tests/no-direct-db.test.ts)
//  fails the build if anything does.
//
//  readRows() is the single door to user data. For every call it:
//    - requires the user id resolved from the verified token (the caller binds
//      it; tools never see or pass a user id),
//    - ALWAYS adds `user_id = <that id>`,
//    - ALWAYS adds `deleted_at IS NULL` on tables that soft-delete (no Trash),
//    - selects ONLY the explicit columns the tool lists (never `*`), and
//      refuses known-secret columns as a last guard,
//    - caps the result at 200 rows.
//
//  Kept free of Deno/JSR imports so the tests can run it under Node with a
//  fake client. index.ts passes in the real supabase-js service-role client.
// ════════════════════════════════════════════════════════════════

export const MAX_ROWS = 200
export const DEFAULT_ROWS = 50

/* Tables the connector may read, and whether each soft-deletes. A table not
   listed here cannot be read at all — user_integrations, user_subscriptions,
   user_preferences, mcp_tokens (except via findToken), community_*, pages… */
export const READABLE_TABLES = {
  clients:              { softDelete: true },
  client_statuses:      { softDelete: true },
  groups:               { softDelete: true },
  group_members:        { softDelete: true },
  sessions:             { softDelete: true },
  scheduled_meetings:   { softDelete: false },
  meeting_types:        { softDelete: true },
  calendar_events:      { softDelete: true },
  bookings:             { softDelete: false },
  leads:                { softDelete: true },
  lead_sources:         { softDelete: true },
  lead_statuses:        { softDelete: true },
  transactions:         { softDelete: true },
  categories:           { softDelete: true },
  recurring_templates:  { softDelete: true },
  payment_plans:        { softDelete: true },
  payment_installments: { softDelete: true },
  payment_requests:     { softDelete: false },
  client_adjustments:   { softDelete: true },
  investments:          { softDelete: true },
  tasks:                { softDelete: true },
  task_statuses:        { softDelete: true },
  task_categories:      { softDelete: true },
  reminders:            { softDelete: true },
  projects:             { softDelete: true },
  goals:                { softDelete: true },
  goal_categories:      { softDelete: true },
  goal_entries:         { softDelete: true },
  user_questions:       { softDelete: true },
  daily_answers:        { softDelete: true },
  moon_snapshots:       { softDelete: false },
} as const
export type ReadableTable = keyof typeof READABLE_TABLES

/* Last guard, NOT the primary control (the primary control is each tool's
   explicit column list). Columns that must never leave the server whatever a
   tool asks for. */
export const FORBIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  'user_id',
  'token_hash',
  'access_token', 'refresh_token', 'api_key', 'api_secret', 'webhook_token',
  'page_code', 'sync_token', 'token_expiry',
  'grow_process_token', 'grow_process_id', 'grow_transaction_id', 'payment_url',
  'invoice_document_url', 'invoice_credit_document_url',
  'stripe_customer_id', 'stripe_subscription_id',
  'google_event_id', 'import_batch_id', 'deleted_at',
])

export type Filter =
  | { op: 'eq'; col: string; value: string | number | boolean }
  | { op: 'in'; col: string; values: string[] }
  | { op: 'gte' | 'lte'; col: string; value: string }
  | { op: 'contains_text'; col: string; value: string }   // case-insensitive substring
  | { op: 'not_null'; col: string }

export type ReadSpec = {
  table: ReadableTable
  columns: readonly string[]
  filters?: Filter[]
  order?: { col: string; ascending: boolean }
  limit?: number
  offset?: number
}

export type TokenRow = {
  id: string
  user_id: string
  categories: string[]
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
}

// Minimal shape of the supabase-js client this file needs (lets tests fake it).
// deno-lint-ignore no-explicit-any
export type QueryClient = { from(table: string): any }

export class DbError extends Error {}

const IDENT = /^[a-z_][a-z0-9_]*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// PostgREST reserved words used as column names must be quoted in select.
const QUOTE = new Set(['desc', 'order'])
const sel = (c: string) => (QUOTE.has(c) ? `"${c}"` : c)

function checkColumn(c: string) {
  if (!IDENT.test(c) || FORBIDDEN_COLUMNS.has(c)) throw new DbError('bad_column')
}

/* Escape LIKE wildcards so a search for "50%" matches literally. */
const likeLiteral = (s: string) => `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`

export function createDb(client: QueryClient) {
  return {
    /* Token lookup — one query returns everything the auth decision needs
       (expiry, revocation, categories). Deliberately not cached. */
    async findToken(tokenHash: string): Promise<TokenRow | null> {
      const { data, error } = await client.from('mcp_tokens')
        .select('id, user_id, categories, expires_at, revoked_at, last_used_at')
        .eq('token_hash', tokenHash)
        .maybeSingle()
      if (error) throw new DbError('token_lookup_failed')
      return (data as TokenRow | null) ?? null
    },

    /* Bookkeeping only — never fails the request. */
    async touchLastUsed(tokenId: string, userId: string): Promise<void> {
      try {
        await client.from('mcp_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', tokenId)
          .eq('user_id', userId)
      } catch { /* ignore */ }
    },

    /* The single door to user data. See the header for the guarantees. */
    async readRows(userId: string, spec: ReadSpec): Promise<Record<string, unknown>[]> {
      if (!UUID.test(userId)) throw new DbError('bad_user')
      const meta = READABLE_TABLES[spec.table]
      if (!meta) throw new DbError('bad_table')
      if (!spec.columns.length) throw new DbError('bad_column')
      spec.columns.forEach(checkColumn)

      const limit = Math.min(Math.max(Math.trunc(spec.limit ?? DEFAULT_ROWS), 1), MAX_ROWS)
      const offset = Math.min(Math.max(Math.trunc(spec.offset ?? 0), 0), 100_000)

      let q = client.from(spec.table)
        .select(spec.columns.map(sel).join(','))
        .eq('user_id', userId)                    // ← tenant isolation, always
      if (meta.softDelete) q = q.is('deleted_at', null)   // ← never Trash

      for (const f of spec.filters ?? []) {
        checkColumn(f.col)
        switch (f.op) {
          case 'eq': q = q.eq(f.col, f.value); break
          case 'in': q = q.in(f.col, f.values.slice(0, MAX_ROWS)); break
          case 'gte': q = q.gte(f.col, f.value); break
          case 'lte': q = q.lte(f.col, f.value); break
          case 'contains_text': q = q.ilike(f.col, likeLiteral(f.value)); break
          case 'not_null': q = q.not(f.col, 'is', null); break
          default: throw new DbError('bad_filter')
        }
      }
      if (spec.order) {
        checkColumn(spec.order.col)
        q = q.order(spec.order.col, { ascending: spec.order.ascending })
      }
      q = q.range(offset, offset + limit - 1)

      const { data, error } = await q
      if (error) throw new DbError('query_failed')
      return (data ?? []) as Record<string, unknown>[]
    },
  }
}

export type Db = ReturnType<typeof createDb>
