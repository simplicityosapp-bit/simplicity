/* Create a one-shot pre-confirmed test user, print credentials.
   Used to verify the signup → onboarding guard flow. */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

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
  console.error('✗ env missing')
  process.exit(1)
}

const EMAIL = `claude-signup-${Date.now()}@simplicity-os.com`
const PASSWORD = `Test-${randomBytes(8).toString('hex')}-Aa1!`

const r = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
})
if (!r.ok) {
  console.error('✗ create failed:', r.status, await r.text())
  process.exit(1)
}
const user = await r.json()
const creds = { email: EMAIL, password: PASSWORD, user_id: user.id }
writeFileSync(join(here, '..', '.claude-signup-test.json'), JSON.stringify(creds, null, 2))
console.log(JSON.stringify(creds, null, 2))
