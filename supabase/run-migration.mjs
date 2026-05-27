// Run a single migration file against the project's Postgres database.
//
// Usage:
//   node supabase/run-migration.mjs <filename>
//   node supabase/run-migration.mjs 0001_seed_status_logs.sql
//
// Looks up the file inside supabase/migrations/. Wraps the SQL in a
// single transaction — succeeds or rolls back entirely.
//
// Needs SUPABASE_DB_URL (direct Postgres connection string) in env or
// in mangata-react/env.download / .env.local. Secrets are never printed.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))

function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  for (const f of ['../env.download', '../env (1).download', '../.env.local', '../.env', './.env']) {
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

const arg = process.argv[2]
if (!arg) {
  console.error('✗ Usage: node supabase/run-migration.mjs <filename>')
  console.error('  Example: node supabase/run-migration.mjs 0001_seed_status_logs.sql')
  process.exit(1)
}

const migrationPath = join(here, 'migrations', arg)
let sql
try {
  sql = readFileSync(migrationPath, 'utf8')
} catch (e) {
  console.error(`✗ Could not read migration file at ${migrationPath}: ${e.message}`)
  process.exit(1)
}

const dbUrl = loadDbUrl()
if (!dbUrl) {
  console.error('✗ Missing SUPABASE_DB_URL.')
  console.error('  Add a line "SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"')
  console.error('  to mangata-react/env.download, then re-run.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query('BEGIN')
  const result = await client.query(sql)
  await client.query('COMMIT')
  const rowsAffected = Array.isArray(result) ? result.reduce((n, r) => n + (r.rowCount || 0), 0) : (result.rowCount || 0)
  console.log(`✓ Migration "${arg}" applied. rowsAffected=${rowsAffected}`)
} catch (e) {
  try { await client.query('ROLLBACK') } catch { /* swallow */ }
  console.error(`✗ Migration "${arg}" FAILED:`, e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
