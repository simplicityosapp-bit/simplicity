/* ════════════════════════════════════════════════════════════════
   TRANSACTION SEARCH — pure, shared by both apps.
   ════════════════════════════════════════════════════════════════
   Moved from apps/web/src/screens/finance/searchTransactions.js so the
   phone, which had no search on its money screen at all, reads the same
   rules.

   Searching spans the WHOLE history, not the selected month: the question
   people actually have is "what has Dana paid me", and answering it by
   asking them to guess the month first is not answering it.

   Matches on what is visible on a transaction row: its description, the
   client or ad-hoc recipient, its project, its category, and its amount.
   Multiple words all have to match (somewhere), so "דנה 300" narrows.
   ════════════════════════════════════════════════════════════════ */

import { toLocalDate } from './scheduledMeetings'

interface Named { id: string; name?: string | null }
export interface SearchableTransaction {
  id?: string
  type?: string | null
  desc?: string | null
  amount?: number | string | null
  date?: string | null
  deleted_at?: string | null
  client_id?: string | null
  project_id?: string | null
  category_id?: string | null
  recipient_name?: string | null
  [key: string]: unknown
}
export interface TransactionSearchOpts {
  query?: string
  type?: 'all' | 'income' | 'expense' | string
  clients?: Named[]
  projects?: Named[]
  categories?: Named[]
}

/* Hebrew has no case, but the other three languages do. */
const norm = (s: unknown) => String(s ?? '').toLowerCase().trim()

/* Digits only, so "1,200" / "₪1200" / "1200" are the same query. */
const digits = (s: unknown) => String(s ?? '').replace(/[^\d]/g, '')

const byId = (rows: Named[] | undefined) => new Map((rows || []).map((r) => [r.id, r]))

export function searchTransactions<T extends SearchableTransaction>(transactions: T[] | null | undefined, { query = '', type = 'all', clients = [], projects = [], categories = [] }: TransactionSearchOpts = {}): T[] {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  const clientsById = byId(clients)
  const projectsById = byId(projects)
  const categoriesById = byId(categories)

  const matched = (transactions || []).filter((tx) => {
    if (tx.deleted_at) return false
    if (type !== 'all' && tx.type !== type) return false
    if (!terms.length) return true

    const hay = norm([
      tx.desc,
      tx.client_id ? clientsById.get(tx.client_id)?.name : null,
      /* A receipt issued to someone who isn't a client still has a name on it. */
      tx.recipient_name,
      tx.project_id ? projectsById.get(tx.project_id)?.name : null,
      tx.category_id ? categoriesById.get(tx.category_id)?.name : null,
    ].filter(Boolean).join(' '))
    const amount = digits(tx.amount)
    return terms.every((term) => {
      if (hay.includes(term)) return true
      /* A numeric term also matches the amount — prefix, not substring, so 300
         doesn't surface ₪1,300,000. */
      const d = digits(term)
      return !!d && amount.startsWith(d)
    })
  })

  // Newest first — the only ordering that makes sense for a lookup across years.
  return matched.sort((a, b) => toLocalDate(b.date as string).getTime() - toLocalDate(a.date as string).getTime())
}
