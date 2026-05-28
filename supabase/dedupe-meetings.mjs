/* Removes duplicate scheduled_meetings via PostgREST (DELETE), one
   per row. Per (user_id, subject_type, subject_id, scheduled_at)
   we keep the row with the earliest created_at — assumed to be
   the original; the later ones are racing-engine artifacts.
   Skips any duplicate that's confirmed/skipped or already linked
   to a session, just in case the engine's racing happened after
   the user already acted on the row. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const out = {}
  for (const f of ['../env.download', '../env (1).download']) {
    try {
      for (const line of readFileSync(join(here, f), 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/)
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    } catch { /* ignore */ }
  }
  return out
}

const env = loadEnv()
const URL_BASE = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function rest(path, init = {}) {
  return fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      ...(init.headers || {}),
    },
  })
}

const all = await (await rest('scheduled_meetings?select=id,user_id,subject_type,subject_id,scheduled_at,status,session_id,created_at')).json()
console.log(`Loaded ${all.length} rows`)

const buckets = new Map()
for (const m of all) {
  const k = `${m.user_id}|${m.subject_type}|${m.subject_id}|${new Date(m.scheduled_at).getTime()}`
  if (!buckets.has(k)) buckets.set(k, [])
  buckets.get(k).push(m)
}
console.log(`Unique slot buckets: ${buckets.size}`)

const toDelete = []
let skippedActed = 0
for (const list of buckets.values()) {
  if (list.length <= 1) continue
  /* Earliest created_at wins. */
  list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  for (let i = 1; i < list.length; i++) {
    const m = list[i]
    if (m.status !== 'pending' || m.session_id) {
      skippedActed++
      continue
    }
    toDelete.push(m.id)
  }
}
console.log(`Duplicate rows queued for delete: ${toDelete.length}`)
if (skippedActed) console.log(`Skipped (already acted on): ${skippedActed}`)

if (!toDelete.length) {
  console.log('Nothing to delete.')
  process.exit(0)
}

/* PostgREST supports DELETE with an `id=in.(…)` filter — fastest path. */
const CHUNK = 50
let done = 0
for (let i = 0; i < toDelete.length; i += CHUNK) {
  const ids = toDelete.slice(i, i + CHUNK)
  const r = await rest(`scheduled_meetings?id=in.(${ids.join(',')})`, { method: 'DELETE' })
  if (!r.ok) {
    console.error(`✗ delete batch failed: ${r.status} ${await r.text()}`)
    process.exit(1)
  }
  done += ids.length
  process.stdout.write(`\r  deleted ${done}/${toDelete.length}`)
}
console.log(`\n✓ removed ${done} duplicate rows`)

/* Final sanity check. */
const after = await (await rest('scheduled_meetings?select=id')).json()
console.log(`Remaining rows: ${after.length}`)
