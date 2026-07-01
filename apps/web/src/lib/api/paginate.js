/* ════════════════════════════════════════════════════════════════
   PAGINATED SELECT — defeat the PostgREST 1000-row default cap.
   ════════════════════════════════════════════════════════════════
   A plain .select() returns at most 1000 rows, SILENTLY truncating
   larger result sets. selectAllRows loops .range() until it gets a
   short page, returning the COMPLETE set in the query's own order.

   `build` MUST return a FRESH query (same filters + order) on each
   call, so .range() can be applied per page. Reads here are
   non-mutating and run against a static per-user dataset, so offset
   pagination is stable — no keyset cursor needed (unlike
   encryptionMigration, which mutates rows as it pages).

   Use ONLY for collection reads. Never for .single()/.maybeSingle()
   or count queries.
   ════════════════════════════════════════════════════════════════ */
const PAGE_SIZE = 1000

export async function selectAllRows(build) {
  const all = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (data && data.length) all.push(...data)
    if (!data || data.length < PAGE_SIZE) return all
  }
}
