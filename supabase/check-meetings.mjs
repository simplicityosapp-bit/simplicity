/* Investigate scheduled_meetings duplicates via REST. */
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

async function fetchAll(path) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  return r.json()
}

const meetings = await fetchAll('scheduled_meetings?select=id,subject_type,subject_id,scheduled_at,status,created_at&order=scheduled_at.asc')
console.log(`Total: ${meetings.length}`)

/* Group by (subject_type, subject_id, scheduled_at) — duplicates have
   the same (type, id, datetime). */
const groups = new Map()
for (const m of meetings) {
  const key = `${m.subject_type}|${m.subject_id}|${new Date(m.scheduled_at).getTime()}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(m)
}

const dupes = [...groups.values()].filter((g) => g.length > 1)
console.log(`Unique slot count: ${groups.size}`)
console.log(`Slots with duplicates: ${dupes.length}`)
console.log(`Total duplicate rows (extras): ${dupes.reduce((s, g) => s + g.length - 1, 0)}`)

if (dupes.length) {
  console.log('\nExamples (first 5):')
  for (const g of dupes.slice(0, 5)) {
    console.log(`  ${g[0].subject_type} ${g[0].subject_id} @ ${new Date(g[0].scheduled_at).toISOString()}  ×${g.length}`)
    for (const m of g) {
      console.log(`     id=${m.id}  status=${m.status}  created_at=${m.created_at}`)
    }
  }
}

/* Also break down by subject — how many slots per subject?
   A weekly recurring with 4 weeks ahead should be ~5 slots (incl
   past 14d). */
console.log('\nPer-subject count:')
const bySubject = new Map()
for (const m of meetings) {
  const k = `${m.subject_type}|${m.subject_id}`
  bySubject.set(k, (bySubject.get(k) || 0) + 1)
}
for (const [k, n] of [...bySubject.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(50)} ${n}`)
}

/* Date span — how far back / forward do they go? */
const ts = meetings.map((m) => new Date(m.scheduled_at).getTime())
if (ts.length) {
  const min = new Date(Math.min(...ts))
  const max = new Date(Math.max(...ts))
  console.log(`\nDate span: ${min.toISOString().slice(0, 10)} → ${max.toISOString().slice(0, 10)}`)
}
