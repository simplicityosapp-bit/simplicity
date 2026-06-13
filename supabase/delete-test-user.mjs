/* Tear down an ephemeral test/audit user (OD-11) so no standing test account is
   left on the production project. Pass a user_id as an arg, or it falls back to
   the id stored in .claude-signup-test.json / .claude-audit-creds.json and also
   removes that local creds file.

   Usage:  node supabase/delete-test-user.mjs [user_id]
   Pairs with create-test-user.mjs (already an ephemeral, timestamped account):
   create → run checks → delete, instead of keeping a permanent claude-audit@ user. */

import { readFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const out = {}
  for (const f of ['../env.download', '../env (1).download', '../.env.local', '../.env']) {
    try {
      const txt = readFileSync(join(here, f), 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/)
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    } catch { /* keep looking */ }
  }
  return out
}

const env = loadEnv()
const URL_BASE = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !SERVICE) {
  console.error('✗ Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

// Resolve the target: CLI arg first, else the id in a local creds file.
const CRED_FILES = ['.claude-signup-test.json', '.claude-audit-creds.json']
let userId = process.argv[2]
let credPath = null
if (!userId) {
  for (const f of CRED_FILES) {
    const p = join(here, '..', f)
    if (existsSync(p)) {
      try { userId = JSON.parse(readFileSync(p, 'utf8')).user_id; credPath = p; break } catch { /* try next */ }
    }
  }
}
if (!userId) {
  console.error('✗ No user_id — pass one as an argument, or create a test user first.')
  process.exit(1)
}

const r = await fetch(`${URL_BASE}/auth/v1/admin/users/${userId}`, {
  method: 'DELETE',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
})
if (!r.ok && r.status !== 404) {
  console.error('✗ delete failed:', r.status, await r.text())
  process.exit(1)
}
if (credPath) { try { rmSync(credPath) } catch { /* non-fatal */ } }
console.log(`✓ deleted test user ${userId}${credPath ? ' + removed local creds file' : ''}`)
