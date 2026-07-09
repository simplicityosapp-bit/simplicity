// Defeat the PostgREST 1000-row default cap (mirrors web lib/api/paginate.js).
// A plain .select() returns at most 1000 rows, SILENTLY truncating larger sets —
// which under-counts finance totals, client balances, sessions, etc. selectAll
// loops .range() until it gets a short page, returning the COMPLETE set in the
// query's own order.
//
// `build` MUST return a FRESH query (same filters + order) on each call so
// .range() can be applied per page. Returns { data, error } so it's a drop-in for
// the existing `await supabase.from(t).select(...)...` call sites. Collection
// reads only — never for .single()/.maybeSingle()/count.
const PAGE_SIZE = 1000

export async function selectAll(build) {
  const all = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    if (data && data.length) all.push(...data)
    if (!data || data.length < PAGE_SIZE) return { data: all, error: null }
  }
}
