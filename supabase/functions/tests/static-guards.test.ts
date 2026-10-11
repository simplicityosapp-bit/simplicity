// Static guards: things that must hold in the source itself.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MCP_CATEGORIES } from '../_shared/mcp-categories.ts'
import { FORBIDDEN_COLUMNS } from '../claude-mcp/db.ts'
import { COLUMNS, TOOLS } from '../claude-mcp/tools.ts'

const FUNCTIONS = fileURLToPath(new URL('..', import.meta.url))
const read = (...p: string[]) => readFileSync(join(FUNCTIONS, ...p), 'utf8')

describe('category list has one source of truth', () => {
  it('migration 0109 CHECK lists exactly the keys in _shared/mcp-categories.ts', () => {
    const sql = read('..', 'migrations', '0109_mcp_tokens.sql')
    const block = sql.match(/categories\s*<@\s*ARRAY\[([\s\S]*?)\]::text\[\]/)
    expect(block, 'CHECK array not found in 0109').toBeTruthy()
    const inSql = [...block![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...inSql].sort()).toEqual([...MCP_CATEGORIES].sort())
    expect(new Set(inSql).size).toBe(inSql.length)
  })

  it('claude-mcp and mcp-tokens import the list from _shared and never redefine it', () => {
    for (const f of ['claude-mcp/server.ts', 'claude-mcp/tools.ts', 'mcp-tokens/handler.ts']) {
      const src = read(f)
      expect(src, f).toMatch(/from '\.\.\/_shared\/mcp-categories\.ts'/)
      // A second list would look like several category keys in a row.
      expect(src, f).not.toMatch(/'clients'\s*,\s*'contact_details'/)
      expect(src, f).not.toMatch(/MCP_CATEGORIES\s*=/)
    }
  })
})

describe('migration 0109: consent record', () => {
  const sql = read('..', 'migrations', '0109_mcp_tokens.sql')
  it('mcp_tokens has consent_version and consented_at, both NOT NULL', () => {
    expect(sql).toMatch(/consent_version\s+text\s+NOT NULL/)
    expect(sql).toMatch(/consented_at\s+timestamp with time zone[^,]*NOT NULL/)
  })
  it('rows are deleted with the account', () => {
    expect(sql).toMatch(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
  })
  it('mcp_token_issue takes the consent version and writes the whole consent record in the same INSERT', () => {
    expect(sql).toMatch(/p_consent_version\s+text/)
    expect(sql).toMatch(/INSERT INTO public\.mcp_tokens[^;]*consent_version[^;]*consented_at[^;]*first_consented_at[^;]*consented_categories[^;]*VALUES[^;]*p_consent_version[^;]*now\(\)[^;]*now\(\)[^;]*p_categories/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.mcp_token_issue\(uuid, text, text\[\], text, text\) TO service_role/)
  })
  it('first_consented_at and consented_categories are NOT NULL', () => {
    expect(sql).toMatch(/first_consented_at\s+timestamp with time zone[^,]*NOT NULL/)
    expect(sql).toMatch(/consented_categories\s+text\[\]\s+NOT NULL/)
  })
  it('the DB itself enforces: categories ⊆ consented, consent only grows, first consent immutable', () => {
    expect(sql).toMatch(/CHECK \(categories <@ consented_categories\)/)
    expect(sql).toMatch(/OLD\.consented_categories <@ NEW\.consented_categories/)
    expect(sql).toMatch(/NEW\.first_consented_at IS DISTINCT FROM OLD\.first_consented_at/)
    expect(sql).toMatch(/CREATE TRIGGER trg_mcp_tokens_consent_guard\s+BEFORE UPDATE ON public\.mcp_tokens/)
  })
  it('mcp_token_update_categories exists, service_role only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.mcp_token_update_categories\(/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.mcp_token_update_categories\(uuid, text\[\], text\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.mcp_token_update_categories\(uuid, text\[\], text\) TO service_role/)
  })
})

describe('mcp-tokens: database access only through store.ts', () => {
  it('no .from( / .rpc( outside store.ts', () => {
    const dir = join(FUNCTIONS, 'mcp-tokens')
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'store.ts')) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\b(Uint8)?Array\.from\(/g, '')
      expect(src, f).not.toMatch(/\.(from|rpc|schema)\s*\(/)
    }
  })
})

describe('claude-mcp: database access only through db.ts', () => {
  const dir = join(FUNCTIONS, 'claude-mcp')
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))

  it('no .from( / .rpc( / .schema( outside db.ts', () => {
    for (const f of files.filter((f) => f !== 'db.ts')) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\b(Uint8)?Array\.from\(/g, '')
      expect(src, `${f} touches the DB directly`).not.toMatch(/\.(from|rpc|schema)\s*\(/)
    }
  })

  it('only index.ts creates a client, and it does not query', () => {
    for (const f of files.filter((f) => f !== 'index.ts')) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/createClient/)
    }
  })

  it('never selects *', () => {
    for (const f of files) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/select\(\s*['"`]\s*\*/)
  })
})

describe('claude-mcp: catalogue shape', () => {
  it('no write tool exists', () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^(get|list)_/)
      expect(t.name).not.toMatch(/create|update|delete|insert|edit|remove|set_|add_/)
    }
    const src = read('claude-mcp', 'db.ts') + read('claude-mcp', 'tools.ts') + read('claude-mcp', 'server.ts')
    expect(src).not.toMatch(/\.(insert|upsert|delete)\s*\(/)
    expect(src).not.toMatch(/read_write/)
  })

  it('no column allowlist contains a forbidden column or *', () => {
    for (const [key, cols] of Object.entries(COLUMNS)) {
      for (const c of cols) {
        expect(FORBIDDEN_COLUMNS.has(c), `${key}.${c}`).toBe(false)
        expect(c).not.toBe('*')
      }
    }
  })

  it('every tool belongs to a known category (or none)', () => {
    for (const t of TOOLS) {
      if (t.category !== null) expect(MCP_CATEGORIES).toContain(t.category)
    }
    expect(TOOLS.filter((t) => t.category === null).map((t) => t.name)).toEqual(['get_access_info'])
  })
})
