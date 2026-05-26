// Quick post-apply verification: table count, RLS coverage, policy + index counts.
// Reads SUPABASE_DB_URL the same way run-schema.mjs does. Secrets never printed.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  for (const f of ['../env.download', '../.env.local', '../.env']) {
    try {
      const m = readFileSync(join(here, f), 'utf8').match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/m)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    } catch { /* keep looking */ }
  }
  return null
}

const client = new pg.Client({ connectionString: loadDbUrl(), ssl: { rejectUnauthorized: false } })
await client.connect()
const tables = (await client.query(
  "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename",
)).rows
const policies = (await client.query("select count(*)::int n from pg_policies where schemaname='public'")).rows[0].n
const indexes = (await client.query("select count(*)::int n from pg_indexes where schemaname='public'")).rows[0].n
const rlsOn = tables.filter((t) => t.rowsecurity).length
console.log(`tables: ${tables.length} | RLS enabled: ${rlsOn}/${tables.length} | policies: ${policies} | indexes: ${indexes}`)
const noRls = tables.filter((t) => !t.rowsecurity).map((t) => t.tablename)
if (noRls.length) console.log('RLS OFF:', noRls.join(', '))
console.log('tables:', tables.map((t) => t.tablename).join(', '))
await client.end()
