/* ════════════════════════════════════════════════════════════════
   FINANCE HELPERS — ported from core.js (snake_case mock fields).
   ════════════════════════════════════════════════════════════════
   financeQuery is the canonical lens over transactions. Pending +
   skipped are excluded by default (they don't "count" in stats),
   matching isConfirmedTx. Pre-Supabase this reads the mock array.
   ════════════════════════════════════════════════════════════════ */

import { transactions } from '../data/mock'

const CURRENCY_SYMBOL = { ILS: '₪', USD: '$', EUR: '€' }

/* Module-level current currency — kept in sync with prefs by the
   PrefsApplier component. Pre-load defaults to ILS. */
let CURRENT_CURRENCY = 'ILS'
export function setCurrentCurrency(c) {
  if (c && CURRENCY_SYMBOL[c]) CURRENT_CURRENCY = c
}
export function getCurrentCurrency() { return CURRENT_CURRENCY }

/* Format a number as the user's currency (e.g. "₪1,200"). */
export function isr(n) {
  const sym = CURRENCY_SYMBOL[CURRENT_CURRENCY] || '₪'
  return sym + Math.round(n || 0).toLocaleString('he-IL')
}

/* Confirmed = not pending and not skipped. */
export function isConfirmedTx(f) {
  return f.status !== 'pending' && f.status !== 'skipped'
}

/* Inclusive bounds for the current calendar month. */
export function currentMonthRange(now = new Date()) {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

/* Filter transactions by an options bag — the canonical way to read finance data.
   opts: { type, projectId, clientId, clientIds, categoryId, from, to,
           includePending, includeSkipped, source }
   `source` is the array to filter — defaults to the mock data; pass real
   Supabase rows once a screen has loaded them. */
export function financeQuery(opts = {}) {
  const {
    type = 'both',
    projectId = null,
    clientId = null,
    clientIds = null,
    categoryId = null,
    from = null,
    to = null,
    includePending = false,
    includeSkipped = false,
    source = transactions,
  } = opts

  const fromTs = from ? (from instanceof Date ? from.getTime() : new Date(from).getTime()) : null
  const toTs = to ? (to instanceof Date ? to.getTime() : new Date(to).getTime()) : null
  const clientIdSet = clientIds && clientIds.length ? new Set(clientIds) : null

  return (source || []).filter((f) => {
    if (f.deleted_at) return false
    if (f.status === 'skipped' && !includeSkipped) return false
    if (!includePending && !isConfirmedTx(f)) return false
    if (type === 'income' && f.type !== 'income') return false
    if (type === 'expense' && f.type !== 'expense') return false
    if (projectId && f.project_id !== projectId) return false
    if (clientId && f.client_id !== clientId) return false
    if (clientIdSet && !clientIdSet.has(f.client_id)) return false
    if (categoryId && f.category_id !== categoryId) return false
    if (fromTs !== null || toTs !== null) {
      const ts = new Date(f.date).getTime()
      if (fromTs !== null && ts < fromTs) return false
      if (toTs !== null && ts > toTs) return false
    }
    return true
  })
}
