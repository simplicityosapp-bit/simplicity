// ════════════════════════════════════════════════════════════════
//  mcp-tokens / store.ts — the ONLY file in mcp-tokens that touches the DB.
// ════════════════════════════════════════════════════════════════
//  Every query is filtered by the user id the handler took from the verified
//  JWT. token_hash is never selected. No Deno/JSR imports, so the tests can
//  run the handler against a fake.
// ════════════════════════════════════════════════════════════════

export type TokenRow = {
  categories: string[]
  consented_categories: string[]
  created_at: string
  expires_at: string
  last_used_at: string | null
}

export type UpdateResult =
  | { result: 'ok'; row: TokenRow }
  | { result: 'consent_required'; missing: string[] }
  | { result: 'no_active_token' }

// Explicit column list: token_hash is never selected, so it cannot leak.
const STATUS_COLUMNS = 'categories, consented_categories, created_at, expires_at, last_used_at'

// deno-lint-ignore no-explicit-any
export type QueryClient = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any }

export type Store = ReturnType<typeof createStore>

export function createStore(client: QueryClient) {
  return {
    async activeRow(userId: string): Promise<TokenRow | null> {
      const { data, error } = await client.from('mcp_tokens')
        .select(STATUS_COLUMNS)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as TokenRow | null) ?? null
    },

    /* Atomic revoke-old + insert-new + consent record (mcp_token_issue). */
    async issue(a: { userId: string; tokenHash: string; categories: string[]; consentVersion: string }): Promise<'ok' | 'rate_limited'> {
      const { error } = await client.rpc('mcp_token_issue', {
        p_user: a.userId,
        p_token_hash: a.tokenHash,
        p_categories: a.categories,
        p_consent_version: a.consentVersion,
      })
      if (error) {
        if (String(error.message ?? '').includes('mcp_token_rate_limited')) return 'rate_limited'
        throw error
      }
      return 'ok'
    },

    /* Atomic category change + consent rule (mcp_token_update_categories).
       consentVersion is the CURRENT version when the request carried it, else
       null — the function then refuses any category outside the consent. */
    async updateCategories(userId: string, categories: string[], consentVersion: string | null): Promise<UpdateResult> {
      const { data, error } = await client.rpc('mcp_token_update_categories', {
        p_user: userId,
        p_categories: categories,
        p_consent_version: consentVersion,
      })
      if (error) throw error
      const r = (Array.isArray(data) ? data[0] : data) as (TokenRow & { result: string; missing: string[] | null }) | null
      if (!r || r.result === 'no_active_token') return { result: 'no_active_token' }
      if (r.result === 'consent_required') return { result: 'consent_required', missing: r.missing ?? [] }
      return {
        result: 'ok',
        row: {
          categories: r.categories,
          consented_categories: r.consented_categories,
          created_at: r.created_at,
          expires_at: r.expires_at,
          last_used_at: r.last_used_at,
        },
      }
    },

    async renew(userId: string, expiresAt: string): Promise<TokenRow | null> {
      const { data, error } = await client.from('mcp_tokens')
        .update({ expires_at: expiresAt })
        .eq('user_id', userId)
        .is('revoked_at', null)
        .select(STATUS_COLUMNS)
        .maybeSingle()
      if (error) throw error
      return (data as TokenRow | null) ?? null
    },

    async revoke(userId: string): Promise<void> {
      const { error } = await client.from('mcp_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('revoked_at', null)
      if (error) throw error
    },
  }
}
