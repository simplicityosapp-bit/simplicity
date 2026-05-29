/* One-shot helper: creates a pre-confirmed user via the Supabase Admin
   API (email_confirm:true bypasses the email link). Used so Claude
   (or any audit tool) can sign in to the local preview without going
   through the signup → email-verify flow.
   Usage:  node supabase/create-audit-user.mjs
   Prints { email, password } on success. Idempotent — if the user
   already exists, it resets the password instead.                       */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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
  console.error('✗ Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const EMAIL = 'claude-audit@simplicity-os.com'
const PASSWORD = `Claude-${randomBytes(8).toString('hex')}-Aa1!`

async function admin(path, opts = {}) {
  const r = await fetch(`${URL_BASE}/auth/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const txt = await r.text()
  let data; try { data = JSON.parse(txt) } catch { data = txt }
  return { status: r.status, data }
}

/* Look for an existing user by email. The list endpoint paginates,
   but for a small dev DB the first page is enough. */
async function findUser(email) {
  const r = await admin(`admin/users?per_page=200`)
  if (r.status !== 200) return null
  return (r.data.users || []).find((u) => u.email === email) || null
}

const existing = await findUser(EMAIL)

let user
if (existing) {
  console.log(`· user exists (${existing.id}) — resetting password`)
  const r = await admin(`admin/users/${existing.id}`, {
    method: 'PUT',
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  })
  if (r.status !== 200) {
    console.error('✗ password reset failed:', r.status, r.data)
    process.exit(1)
  }
  user = r.data
} else {
  console.log('· creating new user')
  const r = await admin('admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    }),
  })
  if (r.status !== 200) {
    console.error('✗ create failed:', r.status, r.data)
    process.exit(1)
  }
  user = r.data
}

const creds = { email: EMAIL, password: PASSWORD, user_id: user.id }
const outPath = join(here, '..', '.claude-audit-creds.json')
writeFileSync(outPath, JSON.stringify(creds, null, 2))
console.log('✓ ready')
console.log(JSON.stringify(creds, null, 2))
console.log(`saved → ${outPath} (gitignored)`)
