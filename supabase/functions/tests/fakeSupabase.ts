// A tiny in-memory stand-in for the supabase-js query builder — only the
// methods db.ts uses. It really filters and projects, so isolation and
// column-allowlist tests exercise db.ts end to end. Every query is recorded.

type Row = Record<string, unknown>
export type QueryLog = { table: string; columns: string[]; filters: string[]; mode: 'select' | 'update' }

class Query {
  private preds: Array<(r: Row) => boolean> = []
  private cols: string[] = []
  private mode: 'select' | 'update' = 'select'
  private patch: Row = {}
  private from = 0
  private to = Number.POSITIVE_INFINITY
  private sort?: { col: string; asc: boolean }
  private single = false
  private entry: QueryLog

  constructor(private tables: Record<string, Row[]>, private table: string, log: QueryLog[]) {
    this.entry = { table, columns: [], filters: [], mode: 'select' }
    log.push(this.entry)
  }
  private add(desc: string, p: (r: Row) => boolean) { this.entry.filters.push(desc); this.preds.push(p); return this }

  select(c: string) { this.cols = c.split(',').map((s) => s.trim().replace(/"/g, '')); this.entry.columns = this.cols; return this }
  update(p: Row) { this.mode = 'update'; this.entry.mode = 'update'; this.patch = p; return this }
  eq(c: string, v: unknown) { return this.add(`eq:${c}=${v}`, (r) => r[c] === v) }
  is(c: string, v: unknown) { return this.add(`is:${c}=${v}`, (r) => (v === null ? r[c] == null : r[c] === v)) }
  in(c: string, vs: unknown[]) { return this.add(`in:${c}`, (r) => vs.includes(r[c])) }
  gte(c: string, v: string) { return this.add(`gte:${c}`, (r) => r[c] != null && String(r[c]) >= v) }
  lte(c: string, v: string) { return this.add(`lte:${c}`, (r) => r[c] != null && String(r[c]) <= v) }
  ilike(c: string, pattern: string) {
    const needle = pattern.slice(1, -1).replace(/\\(.)/g, '$1').toLowerCase()
    return this.add(`ilike:${c}`, (r) => String(r[c] ?? '').toLowerCase().includes(needle))
  }
  not(c: string, op: string, v: unknown) {
    if (op !== 'is' || v !== null) throw new Error('fake: unsupported not()')
    return this.add(`notnull:${c}`, (r) => r[c] != null)
  }
  order(col: string, o: { ascending: boolean }) { this.sort = { col, asc: o.ascending }; return this }
  range(a: number, b: number) { this.from = a; this.to = b; return this }
  maybeSingle() { this.single = true; return this }

  private run(): { data: unknown; error: null } {
    const all = this.tables[this.table] ?? []
    const hits = all.filter((r) => this.preds.every((p) => p(r)))
    if (this.mode === 'update') { hits.forEach((r) => Object.assign(r, this.patch)); return { data: null, error: null } }
    if (this.sort) {
      const { col, asc } = this.sort
      hits.sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * (asc ? 1 : -1))
    }
    const page = hits.slice(this.from, this.to + 1)
      .map((r) => Object.fromEntries(this.cols.map((c) => [c, r[c] ?? null])))
    if (this.single) return { data: page[0] ?? null, error: null }
    return { data: page, error: null }
  }
  then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
    try { return Promise.resolve(resolve(this.run())) } catch (e) { return reject ? Promise.resolve(reject(e)) : Promise.reject(e) }
  }
}

export function fakeClient(tables: Record<string, Row[]>) {
  const log: QueryLog[] = []
  return { log, from: (table: string) => new Query(tables, table, log) }
}
