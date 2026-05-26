// Run supabase/schema.sql against the project's Postgres database.
//
// Usage:
//   node supabase/run-schema.mjs
//
// Needs a direct Postgres connection string (DDL can't run via the REST/service-role key).
// Provide it as SUPABASE_DB_URL — either an env var, or a line in env.download / .env.local:
//   SUPABASE_DB_URL=postgresql://postgres:<DB-PASSWORD>@db.<ref>.supabase.co:5432/postgres
// (Use the "Session" pooler or the direct connection string — not the transaction pooler.)
//
// Secrets are never printed.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))

function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  for (const f of ['../env.download', '../.env.local', '../.env', './.env']) {
    try {
      const txt = readFileSync(join(here, f), 'utf8')
      const m = txt.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/m)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    } catch {
      /* file not present — keep looking */
    }
  }
  return null
}

const dbUrl = loadDbUrl()
if (!dbUrl) {
  console.error('✗ Missing SUPABASE_DB_URL.')
  console.error('  Add a line "SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"')
  console.error('  to mangata-react/env.download (next to the other keys), then re-run.')
  process.exit(1)
}

const sql = readFileSync(join(here, 'schema.sql'), 'utf8')
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql) // multi-statement; runs as one implicit transaction
  const { rows } = await client.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
  )
  console.log(`✓ Schema applied. public-schema tables now: ${rows[0].n}`)
} catch (e) {
  console.error('✗ Schema run FAILED:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
