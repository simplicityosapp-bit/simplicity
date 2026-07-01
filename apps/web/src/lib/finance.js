/* ════════════════════════════════════════════════════════════════
   FINANCE HELPERS — ported from core.js (snake_case mock fields).
   ════════════════════════════════════════════════════════════════
   financeQuery is the canonical lens over transactions. Pending +
   skipped are excluded by default (they don't "count" in stats),
   matching isConfirmedTx. Pre-Supabase this reads the mock array.
   ════════════════════════════════════════════════════════════════ */

import { transactions } from '../data/mock'
import i18n from '@simplicity/core/i18n'

const CURRENCY_SYMBOL = { ILS: '₪', USD: '$', EUR: '€' }

/* Module-level current currency — kept in sync with prefs by the
   PrefsApplier component. Pre-load defaults to ILS. */
let CURRENT_CURRENCY = 'ILS'
export function setCurrentCurrency(c) {
  if (c && CURRENCY_SYMBOL[c]) CURRENT_CURRENCY = c
}
export function getCurrentCurrency() { return CURRENT_CURRENCY }

/* Format a number as the user's currency (e.g. "₪1,200"). Negatives put the
   sign BEFORE the symbol ("-₪50"), not between ("₪-50"). */
export function isr(n) {
  const sym = CURRENCY_SYMBOL[CURRENT_CURRENCY] || '₪'
  const v = Math.round(n || 0)
  const locale = i18n.language === 'he' ? 'he-IL' : (i18n.language || 'he-IL')
  return (v < 0 ? '-' : '') + sym + Math.abs(v).toLocaleString(locale)
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
    includeCancelled = false,
    source = transactions,
  } = opts

  const fromTs = from ? (from instanceof Date ? from.getTime() : new Date(from).getTime()) : null
  const toTs = to ? (to instanceof Date ? to.getTime() : new Date(to).getTime()) : null
  const clientIdSet = clientIds && clientIds.length ? new Set(clientIds) : null

  return (source || []).filter((f) => {
    if (f.deleted_at) return false
    // Credited (cancelled by a credit note) → out of income totals by default,
    // but the transaction list passes includeCancelled to still show it w/ a badge.
    if (f.invoice_credited_at && !includeCancelled) return false
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

/* Daily aggregate for a calendar month with optional scope. Used by the finance
   chart and any future "trend within month" widget. Returns parallel arrays of
   length daysInMonth so chart code can iterate by index without date math. */
export function financeDailyBuckets(year, month, opts = {}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthStart = new Date(year, month, 1, 0, 0, 0, 0)
  const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999)
  const tx = financeQuery({ ...opts, from: monthStart, to: monthEnd })
  const dailyInc = new Array(daysInMonth).fill(0)
  const dailyExp = new Array(daysInMonth).fill(0)
  tx.forEach((f) => {
    const d = new Date(f.date).getDate() - 1
    if (d < 0 || d >= daysInMonth) return
    if (f.type === 'income') dailyInc[d] += f.amount
    else if (f.type === 'expense') dailyExp[d] += f.amount
  })
  const dailyNet = dailyInc.map((v, i) => v - dailyExp[i])
  const cumInc = []
  const cumExp = []
  const cumNet = []
  let ci = 0; let ce = 0; let cn = 0
  for (let i = 0; i < daysInMonth; i += 1) {
    ci += dailyInc[i]; cumInc.push(ci)
    ce += dailyExp[i]; cumExp.push(ce)
    cn += dailyNet[i]; cumNet.push(cn)
  }
  return { daysInMonth, dailyInc, dailyExp, dailyNet, cumInc, cumExp, cumNet }
}

/* Single source of truth for the monthly income goal. Mirrors the prototype's
   getMonthlyIncomeGoal — finds the goals[] record tied to the 'income' goal
   category at the monthly time-frame with no project/parent scope. Returns
   the goal record or null. Caller supplies goals + categories arrays so the
   helper stays pure (and chart/widgets pull from useGoals + useGoalCategories). */
export function getMonthlyIncomeGoal(goals, goalCategories) {
  const incomeCat = (goalCategories || []).find((c) => c.key === 'income')
  if (!incomeCat) return null
  return (goals || []).find(
    (g) => g.category_id === incomeCat.id
      && !g.project_id
      && !g.parent_goal_id
      && g.time_frame === 'monthly',
  ) || null
}
export const getMonthlyIncomeGoalAmount = (goals, goalCategories) => {
  const g = getMonthlyIncomeGoal(goals, goalCategories)
  return g ? (g.target_value || 0) : 0
}
