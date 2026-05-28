/* Supabase audit via PostgREST — used as a fallback when the direct
   Postgres connection (db.<ref>.supabase.co:5432) isn't reachable
   (Supabase decommissioned IPv4 there; some networks block IPv6).
   We can't peek inside pg_catalog from REST, but with the service
   role key we can verify every expected table responds, that
   migration 0001/0002 columns exist, count rows, and probe RLS by
   issuing the same query without auth.
   Usage: node supabase/audit-rest.mjs */

import { readFileSync } from 'node:fs'
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
const ANON = env.VITE_SUPABASE_ANON_KEY

if (!URL_BASE || !SERVICE) {
  console.error('✗ Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

function rest(path, { method = 'GET', headers = {}, key = SERVICE, body } = {}) {
  const url = `${URL_BASE}/rest/v1/${path}`
  const opts = {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Profile': 'public',
      ...headers,
    },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  return fetch(url, opts)
}

function parseSchema() {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8')
  const tables = []
  const re = /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/g
  let m
  while ((m = re.exec(sql)) !== null) {
    const cols = []
    for (const raw of m[2].split('\n')) {
      const line = raw.trim().replace(/,\s*$/, '')
      if (!line) continue
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue
      const cm = line.match(/^"?(\w+)"?\s+/)
      if (cm) cols.push(cm[1])
    }
    tables.push({ name: m[1], cols })
  }
  return tables
}

async function probe(table) {
  const r = await rest(`${table}?select=*&limit=0`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  })
  if (r.status === 200 || r.status === 206) {
    const range = r.headers.get('content-range') || ''
    const m = range.match(/\/(\d+|\*)$/)
    const count = m && m[1] !== '*' ? Number(m[1]) : null
    return { exists: true, count, status: r.status }
  }
  if (r.status === 404 || r.status === 400) {
    return { exists: false, status: r.status }
  }
  const txt = await r.text()
  return { exists: false, status: r.status, error: txt.slice(0, 120) }
}

async function probeColumn(table, column) {
  const r = await rest(`${table}?select=${column}&limit=0`)
  return r.ok
}

async function probeAnonRead(table) {
  /* With ANON key (no auth) we should get 0 rows back from a
     user-scoped table — RLS hides everything because auth.uid() is
     null. status 200 + empty array = correct. status 200 + rows
     means the RLS policy is missing or too permissive. */
  if (!ANON) return null
  const r = await rest(`${table}?select=id&limit=1`, { key: ANON })
  if (!r.ok) return { ok: r.status === 401 || r.status === 403, status: r.status, note: 'denied' }
  const j = await r.json()
  return { ok: j.length === 0, status: r.status, rowsLeaked: j.length }
}

console.log('═══════════════════════════════════════════════════════════════')
console.log('  Supabase audit (REST) — ' + new Date().toISOString().slice(0, 19))
console.log('  endpoint: ' + URL_BASE)
console.log('═══════════════════════════════════════════════════════════════\n')

const expected = parseSchema()
console.log(`Expected tables (schema.sql): ${expected.length}\n`)

/* ── 1. Table presence ─────────────────────────────────────── */
console.log('━━━ 1. Table presence ━━━')
const probes = await Promise.all(expected.map(async (t) => ({ ...(await probe(t.name)), name: t.name })))
const missing = probes.filter((p) => !p.exists)
const present = probes.filter((p) => p.exists)
console.log(`  ✓ ${present.length}/${expected.length} present`)
if (missing.length) {
  console.log(`  ✗ ${missing.length} missing/inaccessible:`)
  missing.forEach((p) => console.log(`     · ${p.name.padEnd(28)} status ${p.status} ${p.error || ''}`))
}
console.log()

/* ── 2. Migration markers ──────────────────────────────────── */
console.log('━━━ 2. Migrations applied ━━━')
const m0002 = await probeColumn('recurring_templates', 'trigger_type')
console.log(`  0002 recurring_templates.trigger_type: ${m0002 ? '✓ present' : '✗ MISSING'}`)
const csl = await probe('client_status_log')
const lsl = await probe('lead_status_log')
console.log(`  client_status_log: ${csl.exists ? '✓' : '✗'}  rows=${csl.count ?? '?'}`)
console.log(`  lead_status_log:   ${lsl.exists ? '✓' : '✗'}  rows=${lsl.count ?? '?'}`)
console.log()

/* ── 3. Schema-version columns spot check ──────────────────── */
console.log('━━━ 3. Spot-check key columns ━━━')
const colChecks = [
  ['clients', 'recurring_day'],
  ['clients', 'status_meta'],
  ['recurring_templates', 'cadence_type'],
  ['recurring_templates', 'trigger_type'],
  ['scheduled_meetings', 'subject_type'],
  ['moon_snapshots', 'confidence'],
  ['transactions', 'orphaned_from'],
  ['user_questions', 'schedule_pattern'],
  ['leads', 'status_meta'],
  ['leads', 'last_status_changed_at'],
]
for (const [t, c] of colChecks) {
  const ok = await probeColumn(t, c)
  console.log(`  ${(t + '.' + c).padEnd(40)} ${ok ? '✓' : '✗ MISSING'}`)
}
console.log()

/* ── 4. RLS smoke test via anon key ────────────────────────── */
console.log('━━━ 4. RLS smoke test (anon read) ━━━')
const rlsTables = ['clients', 'transactions', 'leads', 'tasks', 'sessions', 'recurring_templates', 'categories', 'reminders', 'moon_snapshots']
let rlsClean = true
for (const t of rlsTables) {
  const r = await probeAnonRead(t)
  if (!r) continue
  const flag = r.ok ? '✓ blocked' : `✗ LEAK (rows=${r.rowsLeaked})`
  if (!r.ok) rlsClean = false
  console.log(`  ${t.padEnd(28)} ${flag}`)
}
console.log(rlsClean ? '  ✓ no public reads escaping RLS' : '  ✗ RLS leaks detected')
console.log()

/* ── 5. Row counts (informational) ─────────────────────────── */
console.log('━━━ 5. Row counts ━━━')
const countTables = ['clients', 'transactions', 'leads', 'tasks', 'sessions', 'recurring_templates', 'scheduled_meetings', 'categories', 'projects', 'groups', 'moon_snapshots', 'client_status_log', 'lead_status_log', 'user_questions', 'daily_answers', 'reminders']
for (const t of countTables) {
  const p = await probe(t)
  if (p.exists) console.log(`  ${t.padEnd(28)} ${p.count ?? '?'}`)
}
console.log()

/* ── 6. Adapter → table coverage ───────────────────────────── */
console.log('━━━ 6. Adapter→table coverage ━━━')
const apiDir = join(here, '..', 'src', 'lib', 'api')
const fs = await import('node:fs/promises')
const apiFiles = (await fs.readdir(apiDir)).filter((f) => f.endsWith('.js'))
const adapterTargets = new Set()
for (const f of apiFiles) {
  const txt = await fs.readFile(join(apiDir, f), 'utf8')
  const re = /supabase\.from\(\s*['"]([\w_]+)['"]\s*\)/g
  let m
  while ((m = re.exec(txt)) !== null) adapterTargets.add(m[1])
}
const dbTableNames = present.map((p) => p.name)
const adapterMissing = [...adapterTargets].filter((t) => !dbTableNames.includes(t))
if (adapterMissing.length) {
  console.log(`  ✗ adapters reference tables not in DB: ${adapterMissing.join(', ')}`)
} else {
  console.log(`  ✓ all ${adapterTargets.size} adapter targets exist`)
}
console.log()

console.log('═══════════════════════════════════════════════════════════════')
console.log('  Done.')
console.log('═══════════════════════════════════════════════════════════════')
