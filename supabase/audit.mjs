/* Supabase deep audit — runs a battery of read-only diagnostics
   against the live Postgres database and prints a structured report.
   Usage: node supabase/audit.mjs */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import dns from 'node:dns'
import { promisify } from 'node:util'
import pg from 'pg'

/* Supabase decommissioned IPv4 on the direct db.<ref>.supabase.co
   endpoint; the host now resolves AAAA-only. On some Windows
   networks the system resolver refuses AAAA queries, so we resolve
   via public DNS manually and pass the literal IPv6 to pg. */
const resolver = new dns.Resolver()
resolver.setServers(['8.8.8.8', '1.1.1.1'])
const resolve6 = promisify(resolver.resolve6.bind(resolver))

const here = dirname(fileURLToPath(import.meta.url))

function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  for (const f of ['../env.download', '../env (1).download', '../.env.local', '../.env', './.env']) {
    try {
      const txt = readFileSync(join(here, f), 'utf8')
      const m = txt.match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/m)
      if (m) return m[1].replace(/^["']|["']$/g, '')
    } catch { /* keep looking */ }
  }
  return null
}

const dbUrl = loadDbUrl()
if (!dbUrl) {
  console.error('✗ Missing SUPABASE_DB_URL.')
  process.exit(1)
}

/* Resolve the hostname via public DNS and substitute the literal IPv6
   into the connection string so pg.Client doesn't go back through
   the local resolver. SNI/SSL stays correct because we set the
   `host` separately. */
const u = new URL(dbUrl)
const literal = (await resolve6(u.hostname))[0]
const client = new pg.Client({
  host: literal,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false, servername: u.hostname },
})

/* Parse schema.sql to learn the EXPECTED table list + column lists.
   Best-effort regex parser — handles CREATE TABLE blocks and lists
   columns up to the first constraint or closing paren. */
function parseSchema() {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8')
  const tables = []
  const re = /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/g
  let m
  while ((m = re.exec(sql)) !== null) {
    const name = m[1]
    const body = m[2]
    const cols = []
    for (const raw of body.split('\n')) {
      const line = raw.trim().replace(/,\s*$/, '')
      if (!line) continue
      if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line)) continue
      const colMatch = line.match(/^"?(\w+)"?\s+/)
      if (colMatch) cols.push(colMatch[1])
    }
    tables.push({ name, cols })
  }
  return tables
}

function fmt(rows, columns) {
  if (!rows.length) return '  (none)'
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)))
  const head = columns.map((c, i) => c.padEnd(widths[i])).join('  ')
  const sep  = widths.map((w) => '─'.repeat(w)).join('  ')
  const body = rows.map((r) => columns.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join('  ')).join('\n')
  return `  ${head}\n  ${sep}\n${body.split('\n').map((l) => '  ' + l).join('\n')}`
}

await client.connect()
console.log('═══════════════════════════════════════════════════════════════')
console.log('  Supabase deep audit — ' + new Date().toISOString().slice(0, 19))
console.log('═══════════════════════════════════════════════════════════════\n')

const expectedTables = parseSchema()
const expectedNames = expectedTables.map((t) => t.name)

/* ── 1. Tables presence ──────────────────────────────────────── */
const { rows: dbTables } = await client.query(`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name;
`)
const dbTableNames = dbTables.map((r) => r.table_name)
const missingTables = expectedNames.filter((t) => !dbTableNames.includes(t))
const extraTables = dbTableNames.filter((t) => !expectedNames.includes(t))

console.log('━━━ 1. Tables ━━━')
console.log(`  expected (schema.sql): ${expectedNames.length}`)
console.log(`  actual    (public):    ${dbTableNames.length}`)
if (missingTables.length) {
  console.log(`  ✗ MISSING in DB:`)
  missingTables.forEach((t) => console.log(`     · ${t}`))
} else {
  console.log(`  ✓ all expected tables exist`)
}
if (extraTables.length) {
  console.log(`  ⚠ EXTRA in DB (not in schema.sql):`)
  extraTables.forEach((t) => console.log(`     · ${t}`))
}
console.log()

/* ── 2. Column drift per table ───────────────────────────────── */
console.log('━━━ 2. Column drift ━━━')
const { rows: allCols } = await client.query(`
  select table_name, column_name, data_type
  from information_schema.columns
  where table_schema = 'public'
  order by table_name, ordinal_position;
`)
const colsByTable = new Map()
for (const r of allCols) {
  if (!colsByTable.has(r.table_name)) colsByTable.set(r.table_name, [])
  colsByTable.get(r.table_name).push(r.column_name)
}
let driftFound = 0
for (const t of expectedTables) {
  const actual = colsByTable.get(t.name) || []
  const missing = t.cols.filter((c) => !actual.includes(c))
  const extra = actual.filter((c) => !t.cols.includes(c))
  if (missing.length || extra.length) {
    driftFound++
    console.log(`  ${t.name}`)
    if (missing.length) console.log(`    ✗ missing: ${missing.join(', ')}`)
    if (extra.length)   console.log(`    ⚠ extra:   ${extra.join(', ')}`)
  }
}
if (!driftFound) console.log('  ✓ no column drift')
console.log()

/* ── 3. RLS coverage ─────────────────────────────────────────── */
console.log('━━━ 3. RLS coverage ━━━')
const { rows: rls } = await client.query(`
  select c.relname as table_name, c.relrowsecurity as rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
`)
const { rows: policies } = await client.query(`
  select tablename, count(*)::int as policy_count
  from pg_policies
  where schemaname = 'public'
  group by tablename;
`)
const polByTable = new Map(policies.map((p) => [p.tablename, p.policy_count]))
const rlsIssues = []
for (const t of rls) {
  const pCount = polByTable.get(t.table_name) || 0
  /* System-managed tables (quotes) are deliberately public-readable
     with no RLS. Skip those. */
  if (t.table_name === 'quotes') continue
  if (!t.rls_enabled) rlsIssues.push({ table: t.table_name, issue: 'RLS disabled' })
  else if (pCount === 0) rlsIssues.push({ table: t.table_name, issue: 'no policy' })
}
if (rlsIssues.length) {
  console.log(`  ✗ ${rlsIssues.length} issue(s):`)
  rlsIssues.forEach((r) => console.log(`     · ${r.table.padEnd(28)} ${r.issue}`))
} else {
  console.log('  ✓ every user-scoped table has RLS + ≥1 policy')
}
console.log()

/* ── 4. Migration markers ─────────────────────────────────────── */
console.log('━━━ 4. Migrations applied ━━━')
const { rows: triggerCol } = await client.query(`
  select column_name, data_type
  from information_schema.columns
  where table_schema='public' and table_name='recurring_templates' and column_name='trigger_type';
`)
console.log(`  0002 (trigger_type on recurring_templates): ${triggerCol.length ? '✓ present' : '✗ MISSING'}`)
const { rows: triggerChk } = await client.query(`
  select pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'recurring_templates'::regclass
    and conname like '%trigger_type%';
`)
if (triggerChk.length) console.log(`    check: ${triggerChk[0].def}`)

const { rows: cslCount } = await client.query(`select count(*)::int as n from client_status_log;`)
const { rows: lslCount } = await client.query(`select count(*)::int as n from lead_status_log;`)
console.log(`  0001 seed (status logs): client_status_log=${cslCount[0].n} rows · lead_status_log=${lslCount[0].n} rows`)
console.log()

/* ── 5. Adapter table coverage ────────────────────────────────── */
console.log('━━━ 5. Adapter→table coverage ━━━')
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
const adapterMissing = [...adapterTargets].filter((t) => !dbTableNames.includes(t))
if (adapterMissing.length) {
  console.log('  ✗ adapters reference tables not in DB:')
  adapterMissing.forEach((t) => console.log(`     · ${t}`))
} else {
  console.log(`  ✓ all ${adapterTargets.size} adapter targets exist`)
}
console.log()

/* ── 6. Indices on hot lookup columns ─────────────────────────── */
console.log('━━━ 6. Indices on hot columns ━━━')
const { rows: idx } = await client.query(`
  select schemaname, tablename, indexname, indexdef
  from pg_indexes
  where schemaname = 'public'
  order by tablename, indexname;
`)
const idxByTable = new Map()
for (const r of idx) {
  if (!idxByTable.has(r.tablename)) idxByTable.set(r.tablename, [])
  idxByTable.get(r.tablename).push(r.indexdef)
}
function hasIndexOn(table, column) {
  const list = idxByTable.get(table) || []
  return list.some((def) => new RegExp(`\\(${column}\\b|\\(${column},`).test(def))
}
const hotChecks = [
  ['clients', 'user_id'],
  ['transactions', 'user_id'],
  ['transactions', 'date'],
  ['transactions', 'client_id'],
  ['transactions', 'recurring_id'],
  ['scheduled_meetings', 'subject_id'],
  ['scheduled_meetings', 'scheduled_at'],
  ['recurring_templates', 'user_id'],
  ['reminders', 'user_id'],
  ['leads', 'user_id'],
  ['sessions', 'client_id'],
  ['tasks', 'user_id'],
  ['goal_entries', 'category_id'],
  ['client_status_log', 'client_id'],
  ['lead_status_log', 'lead_id'],
  ['moon_snapshots', 'user_id'],
]
const missingIdx = hotChecks.filter(([t, c]) => !hasIndexOn(t, c))
if (missingIdx.length) {
  console.log(`  ⚠ no index covering these hot columns:`)
  missingIdx.forEach(([t, c]) => console.log(`     · ${t}.${c}`))
} else {
  console.log('  ✓ all checked hot columns have a covering index')
}
console.log()

/* ── 7. Row counts (informational) ────────────────────────────── */
console.log('━━━ 7. Row counts (informational) ━━━')
const countQueries = [
  'clients', 'transactions', 'leads', 'tasks', 'sessions',
  'recurring_templates', 'scheduled_meetings', 'categories',
  'projects', 'groups', 'moon_snapshots',
  'client_status_log', 'lead_status_log',
  'user_questions', 'daily_answers', 'reminders',
]
for (const t of countQueries) {
  if (!dbTableNames.includes(t)) continue
  const { rows } = await client.query(`select count(*)::int as n from ${t};`)
  console.log(`  ${t.padEnd(28)} ${rows[0].n}`)
}
console.log()

/* ── 8. Foreign-key integrity (orphan check) ──────────────────── */
console.log('━━━ 8. Orphan-row spot checks ━━━')
const orphanChecks = [
  ['transactions', 'client_id', 'clients'],
  ['transactions', 'project_id', 'projects'],
  ['transactions', 'category_id', 'categories'],
  ['transactions', 'recurring_id', 'recurring_templates'],
  ['sessions', 'client_id', 'clients'],
  ['tasks', 'client_id', 'clients'],
  ['client_status_log', 'client_id', 'clients'],
  ['lead_status_log', 'lead_id', 'leads'],
]
const orphans = []
for (const [child, fk, parent] of orphanChecks) {
  if (!dbTableNames.includes(child) || !dbTableNames.includes(parent)) continue
  try {
    const { rows } = await client.query(`
      select count(*)::int as n
      from ${child} c
      where c.${fk} is not null
        and not exists (select 1 from ${parent} p where p.id = c.${fk});
    `)
    if (rows[0].n > 0) orphans.push({ child: `${child}.${fk}`, parent, count: rows[0].n })
  } catch (e) {
    orphans.push({ child: `${child}.${fk}`, parent, count: `err: ${e.message}` })
  }
}
if (orphans.length) {
  console.log(`  ⚠ orphan rows found:`)
  orphans.forEach((o) => console.log(`     · ${o.child.padEnd(34)} → ${o.parent.padEnd(20)} ${o.count} orphans`))
} else {
  console.log('  ✓ no orphan FK rows detected in spot checks')
}
console.log()

await client.end()
console.log('═══════════════════════════════════════════════════════════════')
console.log('  Done.')
console.log('═══════════════════════════════════════════════════════════════')
