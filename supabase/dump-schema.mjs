// ════════════════════════════════════════════════════════════════
//  dump-schema.mjs — regenerate supabase/schema.sql from the LIVE database
// ════════════════════════════════════════════════════════════════
//  schema.sql used to be hand-assembled from introspect-schema.sql output,
//  which is why it drifted: nobody re-derives a file by hand. This script
//  does the whole job, so "catch schema.sql up" is one command.
//
//  Usage:
//    node supabase/dump-schema.mjs [--watermark 0111] [--out supabase/schema.sql]
//    node supabase/dump-schema.mjs --bundle <captured.json>   # no DB access needed
//
//  Needs a direct Postgres connection (DDL metadata is not reachable via
//  PostgREST). Provide SUPABASE_DB_URL as an env var, or as a line in
//  .env.local / env.download at the repo root:
//    SUPABASE_DB_URL=postgresql://postgres:<PW>@db.<ref>.supabase.co:5432/postgres
//
//  READ-ONLY. Issues nothing but SELECT. Never prints the connection string.
// ════════════════════════════════════════════════════════════════

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')

/* ── dependency + credential loading ─────────────────────────── */

// Inside a git worktree `.git` is a file pointing at the main checkout, and
// that checkout is where node_modules and the gitignored env file actually
// live. Both lookups below fall back to it.
function mainCheckout() {
  try {
    const m = readFileSync(join(repo, '.git'), 'utf8').match(/^gitdir:\s*(.+?)[\r\n]*$/m)
    if (m) return m[1].replace(/[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/, '')
  } catch { /* a normal checkout — .git is a directory */ }
  return null
}

async function loadPg() {
  const roots = [here, repo, join(repo, 'apps', 'web')]
  const main = mainCheckout()
  if (main) roots.push(main, join(main, 'apps', 'web'))

  for (const root of roots) {
    try {
      const req = createRequire(join(root, 'package.json'))
      return (await import(pathToFileURL(req.resolve('pg')).href)).default
    } catch { /* try the next root */ }
  }
  throw new Error('cannot resolve the `pg` module — run `corepack pnpm install` first')
}

function loadDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL
  const files = ['supabase/.env', '.env', '.env.local', 'env.download']
  const roots = [repo, mainCheckout()].filter(Boolean)
  for (const root of roots) {
    for (const f of files) {
      try {
        const m = readFileSync(join(root, f), 'utf8').match(/^\s*SUPABASE_DB_URL\s*=\s*(.+?)\s*$/m)
        const url = m && m[1].replace(/^["']|["']$/g, '')
        // An un-filled placeholder from .env.example is "not set", not a bad
        // host — otherwise it fails much later as an opaque connection error.
        if (url && !url.includes('<')) return url
      } catch { /* file not present — keep looking */ }
    }
  }
  throw new Error(
    'SUPABASE_DB_URL not found. Put it in supabase/.env (gitignored):\n' +
    '  SUPABASE_DB_URL=postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres\n' +
    'Supabase dashboard → Project Settings → Database → Connection string.',
  )
}

/* ── helpers ─────────────────────────────────────────────────── */

const SAFE_IDENT = /^[a-z_][a-z0-9_$]*$/
const q = (id) => (SAFE_IDENT.test(id) ? id : '"' + id.replace(/"/g, '""') + '"')
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'"
const rule = (t) => `-- ══ ${t} ${'═'.repeat(Math.max(2, 54 - t.length))}`
const banner = (t) => [
  '', '-- ════════════════════════════════════════════════════════════════',
  `--  ${t}`, '-- ════════════════════════════════════════════════════════════════',
]
const bySet = (a) => [...a].sort().join(',')

/* ── main ────────────────────────────────────────────────────── */

const args = process.argv.slice(2)
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const watermark = argOf('--watermark', null)
const outArg = argOf('--out', join('supabase', 'schema.sql'))
const outPath = isAbsolute(outArg) ? outArg : join(repo, outArg)

// Metadata comes from a live Postgres connection, or from a JSON bundle
// captured earlier (--bundle). The bundle exists because the direct connection
// needs the database password, and some callers legitimately do not have it —
// CI, or a session holding only a read-only API connector. Same output either
// way: the bundle is exactly the rows the queries below return.
const bundleArg = argOf('--bundle', null)

async function readFromDatabase() {
const pg = await loadPg()
const client = new pg.Client({ connectionString: loadDbUrl(), ssl: { rejectUnauthorized: false } })
await client.connect()
const all = async (sql) => (await client.query(sql)).rows

// Everything below is a plain SELECT against pg_catalog / information_schema.
const [
  exts, funcs, cols, cons, idxs, trigs, rls, pols, comments,
  tableGrants, funcGrants, buckets, realtime, replident,
] = await Promise.all([
  all(`select e.extname, n.nspname as schema from pg_extension e
       join pg_namespace n on n.oid = e.extnamespace
       where e.extname <> 'plpgsql' order by e.extname`),

  all(`select p.proname, pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       order by p.proname, p.oid`),

  all(`select c.relname as tbl, a.attname as col,
              format_type(a.atttypid, a.atttypmod) as coltype,
              a.attnotnull as notnull, pg_get_expr(ad.adbin, ad.adrelid) as def
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname, a.attnum`),

  all(`select c.relname as tbl, con.conname as name, con.contype::text as kind,
              pg_get_constraintdef(con.oid) as def
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and con.contype in ('p','u','c','f','x')
       order by c.relname, case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, con.conname`),

  all(`select c.relname as tbl, i.relname as name, pg_get_indexdef(x.indexrelid) as def
       from pg_index x
       join pg_class i on i.oid = x.indexrelid
       join pg_class c on c.oid = x.indrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and not exists (select 1 from pg_constraint con where con.conindid = x.indexrelid)
       order by c.relname, i.relname`),

  all(`select c.relname as tbl, t.tgname as name, pg_get_triggerdef(t.oid) as def
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and not t.tgisinternal
       order by c.relname, t.tgname`),

  all(`select c.relname as tbl, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`),

  all(`select schemaname as schema, tablename as tbl, policyname as name, permissive,
              roles::text[] as roles, cmd, qual, with_check
       from pg_policies where schemaname in ('public','storage')
       order by schemaname, tablename, policyname`),

  all(`select c.relname as tbl, d.objsubid, a.attname as col, d.description
       from pg_description d
       join pg_class c on c.oid = d.objoid
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname, d.objsubid`),

  all(`select table_name as tbl, grantee, privilege_type as priv
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
       order by table_name, grantee, privilege_type`),

  all(`select p.proname, pg_get_function_identity_arguments(p.oid) as args,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       order by p.proname, p.oid`),

  all(`select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`),
  all(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`),
  all(`select c.relname as tbl, c.relreplident::text as ident
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relreplident <> 'd'
       order by c.relname`),
])

await client.end()
return { exts, funcs, cols, cons, idxs, trigs, rls, pols, comments,
         tableGrants, funcGrants, buckets, realtime, replident }
}

const source = bundleArg
  ? JSON.parse(readFileSync(isAbsolute(bundleArg) ? bundleArg : join(repo, bundleArg), 'utf8'))
  : await readFromDatabase()

const { exts, funcs, cols, cons, idxs, trigs, rls, pols, comments,
        tableGrants, funcGrants, buckets, realtime, replident } = source
for (const [k, v] of Object.entries(source)) {
  if (!Array.isArray(v)) throw new Error(`bundle section "${k}" is not an array`)
}

/* ── group by table ──────────────────────────────────────────── */
const group = (rows, key = 'tbl') => rows.reduce((m, r) => ((m[r[key]] ??= []).push(r), m), {})
const [colsBy, consBy, idxBy, trigBy, comBy] =
  [cols, cons, idxs, trigs, comments].map((r) => group(r))
const polsBy = group(pols.filter((p) => p.schema === 'public'))
const tables = Object.keys(colsBy).sort()

/* ── emit ────────────────────────────────────────────────────── */
const L = []
const migFiles = readdirSync(join(repo, 'supabase', 'migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()

L.push(
  '-- ════════════════════════════════════════════════════════════════',
  '--  schema.sql — the complete public schema, introspected from the LIVE database',
  `--  ${watermark ? `Watermark: migration ${watermark}.  ` : ''}Generated: ${new Date().toISOString().slice(0, 10)}`,
  '--  Regenerate with:  node supabase/dump-schema.mjs --watermark <NNNN>',
  '--',
  '--  THIS FILE RUNS. It rebuilds an empty Postgres database into this schema —',
  '--  that is what makes staging, CI and disaster recovery possible. Apply it with',
  '--  `node supabase/run-schema.mjs` against a FRESH database. Never against',
  '--  production: it creates, it does not migrate.',
  '--',
  '--  Statement order is dependency order, not reading order: functions precede the',
  '--  policies and triggers that call them, every table precedes the foreign keys',
  '--  that point at it. Sections are grouped by table inside that constraint.',
  '--  `check_function_bodies` is off so a function body may reference a table that',
  '--  is created further down — the same thing pg_dump does.',
  '--',
  '--  WHAT IS NOT HERE: no data, no roles, no auth.* / storage.* internals beyond',
  '--  the one bucket and its policies, and no cron jobs — the cron commands carry',
  '--  CRON_SECRET and POLL_SECRET in plain text and must not enter git (see L8).',
  `--  Migration files present in the repo: ${migFiles.length}. Which of them are actually`,
  '--  applied is documented in supabase/migrations/README.md — NOT in the database',
  '--  history table, which is incomplete and is not the source of truth.',
  '--',
  '--  TWO THINGS THAT SILENTLY BREAK IF EDITED BY HAND:',
  '--   1. Policies marked AS RESTRICTIVE combine with AND. The tier caps and the',
  '--      community impersonation guards depend on it; recreating one as permissive',
  '--      disables the cap without any error.',
  '--   2. The PRIVILEGES section is load-bearing. Migration 0107 made function GRANTs',
  '--      matter (three report RPCs were reachable by anon), and the community tables',
  '--      deliberately withhold INSERT/UPDATE from `authenticated` so writes must go',
  '--      through SECURITY DEFINER functions. A blanket GRANT ALL undoes both.',
  '-- ════════════════════════════════════════════════════════════════',
  '',
  'SET check_function_bodies = false;',
)

banner('EXTENSIONS').forEach((l) => L.push(l))
L.push('-- Some of these are provisioned by the Supabase platform; IF NOT EXISTS makes',
       '-- the file safe to run on a project where they are already installed.')
for (const e of exts) L.push(`CREATE EXTENSION IF NOT EXISTS ${q(e.extname)} WITH SCHEMA ${q(e.schema)};`)

banner(`FUNCTIONS (${funcs.length}, full bodies)`).forEach((l) => L.push(l))
for (const f of funcs) {
  L.push('', f.def.trimEnd().endsWith(';') ? f.def.trimEnd() : f.def.trimEnd() + ';')
}

banner(`TABLES (${tables.length}) — columns, primary keys, unique and check constraints`).forEach((l) => L.push(l))
for (const t of tables) {
  L.push('', rule(t))
  const body = colsBy[t].map((c) =>
    `  ${q(c.col)} ${c.coltype}${c.notnull ? ' NOT NULL' : ''}${c.def ? ` DEFAULT ${c.def}` : ''}`)
  L.push(`CREATE TABLE public.${q(t)} (`, body.join(',\n'), ');')
  for (const c of (consBy[t] ?? []).filter((x) => x.kind !== 'f')) {
    L.push(`ALTER TABLE public.${q(t)} ADD CONSTRAINT ${q(c.name)} ${c.def};`)
  }
  for (const c of (comBy[t] ?? [])) {
    L.push(c.objsubid === 0
      ? `COMMENT ON TABLE public.${q(t)} IS ${lit(c.description)};`
      : `COMMENT ON COLUMN public.${q(t)}.${q(c.col)} IS ${lit(c.description)};`)
  }
}

banner('FOREIGN KEYS — after every table exists').forEach((l) => L.push(l))
for (const c of cons.filter((x) => x.kind === 'f')) {
  L.push(`ALTER TABLE public.${q(c.tbl)} ADD CONSTRAINT ${q(c.name)} ${c.def};`)
}

banner(`INDEXES (${idxs.length}; constraint-backed indexes are created above)`).forEach((l) => L.push(l))
for (const t of tables) for (const i of (idxBy[t] ?? [])) L.push(`${i.def};`)

banner(`TRIGGERS (${trigs.length})`).forEach((l) => L.push(l))
for (const t of tables) for (const tr of (trigBy[t] ?? [])) L.push(`${tr.def};`)

banner(`ROW LEVEL SECURITY (${pols.filter((p) => p.schema === 'public').length} policies)`).forEach((l) => L.push(l))
for (const t of tables) {
  const r = rls.find((x) => x.tbl === t)
  const ps = polsBy[t] ?? []
  if (!r?.enabled && !ps.length) continue
  L.push('', rule(t))
  if (r?.enabled) L.push(`ALTER TABLE public.${q(t)} ENABLE ROW LEVEL SECURITY;`)
  if (r?.forced) L.push(`ALTER TABLE public.${q(t)} FORCE ROW LEVEL SECURITY;`)
  for (const p of ps) {
    const head = `CREATE POLICY ${q(p.name)} ON public.${q(t)}` +
      (p.permissive === 'RESTRICTIVE' ? ' AS RESTRICTIVE' : '') +
      ` FOR ${p.cmd} TO ${p.roles.map(q).join(', ')}`
    const parts = [head]
    if (p.qual) parts.push(`  USING (${p.qual})`)
    if (p.with_check) parts.push(`  WITH CHECK (${p.with_check})`)
    L.push(parts.join('\n') + ';')
  }
}

banner('PRIVILEGES — see the header: this section is load-bearing').forEach((l) => L.push(l))
{
  const held = {}
  for (const g of tableGrants) ((held[g.grantee] ??= {})[g.tbl] ??= new Set()).add(g.priv)
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const per = held[role] ?? {}
    const tally = {}
    for (const t of tables) {
      const k = bySet(per[t] ?? new Set())
      tally[k] = (tally[k] ?? 0) + 1
    }
    const modal = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    L.push('')
    if (modal) L.push(`GRANT ${modal.split(',').join(', ')} ON ALL TABLES IN SCHEMA public TO ${q(role)};`)
    const modalSet = new Set(modal ? modal.split(',') : [])
    for (const t of tables) {
      const actual = per[t] ?? new Set()
      const revoke = [...modalSet].filter((p) => !actual.has(p)).sort()
      const grant = [...actual].filter((p) => !modalSet.has(p)).sort()
      if (revoke.length) L.push(`REVOKE ${revoke.join(', ')} ON public.${q(t)} FROM ${q(role)};`)
      if (grant.length) L.push(`GRANT ${grant.join(', ')} ON public.${q(t)} TO ${q(role)};`)
    }
  }
  L.push('', '-- Function EXECUTE. Default Postgres grants EXECUTE to PUBLIC, so every',
             '-- function is revoked first and then granted back only where it is held.')
  for (const f of funcGrants) {
    const sig = `public.${q(f.proname)}(${f.args})`
    L.push(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`)
    const to = ['anon', 'authenticated', 'service_role'].filter((r) => f[r])
    if (to.length) L.push(`GRANT EXECUTE ON FUNCTION ${sig} TO ${to.map(q).join(', ')};`)
  }
}

banner('STORAGE — buckets and their policies').forEach((l) => L.push(l))
for (const b of buckets) {
  L.push('INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)',
         `VALUES (${lit(b.id)}, ${lit(b.name)}, ${b.public}, ${b.file_size_limit ?? 'NULL'}, ` +
         `${b.allowed_mime_types ? `ARRAY[${b.allowed_mime_types.map(lit).join(', ')}]` : 'NULL'})`,
         'ON CONFLICT (id) DO NOTHING;')
}
for (const p of pols.filter((x) => x.schema === 'storage')) {
  const head = `CREATE POLICY ${q(p.name)} ON storage.${q(p.tbl)}` +
    (p.permissive === 'RESTRICTIVE' ? ' AS RESTRICTIVE' : '') +
    ` FOR ${p.cmd} TO ${p.roles.map(q).join(', ')}`
  const parts = [head]
  if (p.qual) parts.push(`  USING (${p.qual})`)
  if (p.with_check) parts.push(`  WITH CHECK (${p.with_check})`)
  L.push(parts.join('\n') + ';')
}

banner('REALTIME — publication membership and replica identity').forEach((l) => L.push(l))
for (const r of replident) {
  const word = { f: 'FULL', n: 'NOTHING', i: 'INDEX' }[r.ident] ?? 'DEFAULT'
  L.push(`ALTER TABLE public.${q(r.tbl)} REPLICA IDENTITY ${word};`)
}
for (const r of realtime) L.push(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${q(r.tablename)};`)

L.push('')
writeFileSync(outPath, L.join('\n'), 'utf8')
console.log(`schema written: ${outArg}`)
console.log(`  ${tables.length} tables · ${funcs.length} functions · ${pols.length} policies · ` +
            `${idxs.length} indexes · ${trigs.length} triggers · ${buckets.length} bucket(s) · ` +
            `${realtime.length} realtime table(s)`)
