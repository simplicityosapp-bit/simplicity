/* ════════════════════════════════════════════════════════════════
   TRANSACTION SEARCH — pure, no React.
   ════════════════════════════════════════════════════════════════
   Searching spans the WHOLE history, not the selected month: the question
   people actually have is "what has Dana paid me", and answering it by
   asking them to guess the month first is not answering it.

   Everything is already in the React Query cache, so this is a filter over
   an array — no fetch, no schema, no index.

   Matches on what is visible on a transaction row: its description, the
   client or ad-hoc recipient it belongs to, its project, its category, and
   its amount. Multiple words all have to match (somewhere), so "דנה 300"
   narrows rather than widens.
   ════════════════════════════════════════════════════════════════ */

import { toLocalDate } from '@simplicity/core'

/* Hebrew has no case, but the other three languages do, and clients get
   typed in every casing. */
const norm = (s) => String(s ?? '').toLowerCase().trim()

/* Digits only, so "1,200" / "₪1200" / "1200" are the same query. Returns ''
   for a term with no digits, which callers treat as "not a number search". */
const digits = (s) => String(s ?? '').replace(/[^\d]/g, '')

/* The haystack for one transaction: everything the row shows. Built once per
   transaction per search rather than per term. */
function haystack(tx, { clientsById, projectsById, categoriesById }) {
  const client = tx.client_id ? clientsById.get(tx.client_id) : null
  const project = tx.project_id ? projectsById.get(tx.project_id) : null
  const category = tx.category_id ? categoriesById.get(tx.category_id) : null
  return norm([
    tx.desc,
    client?.name,
    /* A receipt issued to someone who isn't a client still has a name on it. */
    tx.recipient_name,
    project?.name,
    category?.name,
  ].filter(Boolean).join(' '))
}

const byId = (rows) => new Map((rows || []).map((r) => [r.id, r]))

/**
 * Filter transactions by a free-text query and a type chip.
 *
 * @param transactions all rows (the full cache — deleted ones are dropped here)
 * @param query        free text; blank means "no text filter"
 * @param type         'all' | 'income' | 'expense'
 * @returns matching rows, newest first
 */
export function searchTransactions(transactions, { query = '', type = 'all', clients = [], projects = [], categories = [] } = {}) {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  const lookups = { clientsById: byId(clients), projectsById: byId(projects), categoriesById: byId(categories) }

  const matched = (transactions || []).filter((tx) => {
    if (tx.deleted_at) return false
    if (type !== 'all' && tx.type !== type) return false
    if (!terms.length) return true

    const hay = haystack(tx, lookups)
    const amount = digits(tx.amount)
    return terms.every((term) => {
      if (hay.includes(term)) return true
      /* A numeric term also matches the amount — "300" finds ₪300 even though
         no text on the row contains it. Prefix, not substring, so 300 doesn't
         surface ₪1,300,000. */
      const d = digits(term)
      return !!d && amount.startsWith(d)
    })
  })

  /* Newest first. Results span years once the query leaves month scope, and
     "most recent" is the only ordering that makes sense for a lookup. */
  return matched.sort((a, b) => toLocalDate(b.date) - toLocalDate(a.date))
}

/** Is any filter actually narrowing the list? Drives the "searching" mode. */
export function isSearchActive({ query = '', type = 'all' } = {}) {
  return norm(query).length > 0 || type !== 'all'
}
