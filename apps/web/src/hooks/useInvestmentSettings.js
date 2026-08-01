import { useCallback, useMemo } from 'react'
import { financeQuery, previousMonthRange, currentMonthRange, toLocalDate } from '@simplicity/core'
import { useUserPreferences } from './useUserPreferences'
import { useTransactions } from './useTransactions'
import { useInvestments } from './useInvestments'

/* ════════════════════════════════════════════════════════════════
   useInvestmentSettings — "כמה מההכנסה להפריש להשקעות".
   ════════════════════════════════════════════════════════════════
   Settings persist under user_preferences.investment (JSONB) — the
   same arrangement useReportsConfig uses for its sub-tree, so there
   is NO schema change and nothing to migrate for existing users.

   Shape:
     {
       base:    'income' | 'net',         // what the percentage is taken of
       percent: number,                   // 0–100
       view:    'monthly' | 'cumulative', // which INVESTED total to show
     }

   Two independent numbers, and it matters which is which:

     targetAmount   — the widget itself, ALWAYS on screen. percent × last
                      month's income (or net). The toggle does not touch it.
                      Based on the previous calendar month, the last one that
                      actually closed — a figure that climbs all month is not
                      something you can set aside against.

     investedAmount — the record of what the user actually put in, and the
                      ONLY thing the חודשי/מצטבר toggle switches:
                        monthly    → invested during the current month
                        cumulative → invested all time
                      Both read the history exclusively. The system never
                      infers an investment: it counts only what the user
                      explicitly confirmed. Until that history exists there
                      is nothing to sum, so both read ₪0 and say so via
                      `investmentsKnown`.

   "net" is deliberately the app's existing word (the finance hero prints
   נטו, the chart plots net) — not a second name for the same arithmetic.

   Income and net are read through financeQuery, the app's canonical lens
   over transactions, so this widget counts exactly what the finance
   screen's own header counts: confirmed rows only — pending, skipped,
   soft-deleted and credit-noted transactions all drop out.
   ════════════════════════════════════════════════════════════════ */

export const INVESTMENT_BASES = ['income', 'net']
export const INVESTMENT_VIEWS = ['monthly', 'cumulative']

/* 10% is a starting point, not a recommendation — the whole widget exists
   so the user picks their own number. 'monthly' is the required default. */
function defaults() {
  return { base: 'income', percent: 10, view: 'monthly' }
}

/* Coerce a percentage to something safe to compute with: a finite number in
   0–100, at most two decimals. Anything else falls back to the default —
   an empty input or a stray string must not turn the amount into NaN. */
export function normalizePercent(value) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  if (!Number.isFinite(n)) return defaults().percent
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100
}

export function migrateInvestmentSettings(cfg) {
  const out = { ...defaults(), ...(cfg || {}) }
  if (!INVESTMENT_BASES.includes(out.base)) out.base = defaults().base
  if (!INVESTMENT_VIEWS.includes(out.view)) out.view = defaults().view
  out.percent = normalizePercent(out.percent)
  return out
}

/* The whole calculation, as a pure function — no React, no Supabase. It lives
   out here for the same reason netChartGeometry does: the arithmetic is the
   part worth testing, and a hook that needs a provider tree can't be. `now`
   is injectable so a test can stand on a fixed month.
   Returns everything the row needs to both print a figure and explain it. */
export function computeInvestment(transactions, settings, now = new Date(), investments = null) {
  const cfg = migrateInvestmentSettings(settings)
  const rows = Array.isArray(investments) ? investments : []

  /* ── The target: always last month, never switched by the toggle. ──
     Expenses created BY an investment are excluded from the base, or the
     target eats itself: ₪800 recorded in August shrinks August's net, which
     is what September's target is computed from, and the figure spirals down
     month over month. Excluded by transaction id — never by category name,
     which the user can rename at will. */
  const investedTxIds = new Set(rows.map((r) => r?.transaction_id).filter(Boolean))
  const source = investedTxIds.size
    ? (transactions || []).filter((t) => !investedTxIds.has(t.id))
    : (transactions || [])

  const range = previousMonthRange(now)
  const sum = (type) => financeQuery({ type, ...range, source })
    .reduce((s, f) => s + (f.amount || 0), 0)

  const income = sum('income')
  const expenses = sum('expense')
  const net = income - expenses
  const baseAmount = cfg.base === 'net' ? net : income

  /* A losing month yields a negative base, and "invest −₪800" is not a thing.
     Floor the target at zero and hand the UI a flag so the row can say WHY it
     reads ₪0 instead of looking broken. */
  const baseWasNegative = baseAmount < 0
  const targetAmount = baseWasNegative ? 0 : (cfg.percent / 100) * baseAmount

  /* ── The record: only what the user explicitly confirmed investing. ──
     `null` means the history isn't wired up yet (it ships with the "השקעתי X"
     sub-task) — which is NOT the same as "you have invested ₪0", and the row
     must not claim otherwise. */
  const investmentsKnown = Array.isArray(investments)
  const total = (list) => list.reduce((s, r) => s + (Number(r?.amount) || 0), 0)

  const thisMonth = currentMonthRange(now)
  const investedThisMonth = total(rows.filter((r) => {
    if (!r?.invested_on) return false
    /* toLocalDate, not new Date — invested_on is a DATE column, and reading it
       as UTC midnight would file the 1st under the previous month west of
       Greenwich, so "invested this month" would quietly drop it. */
    const ts = toLocalDate(r.invested_on).getTime()
    return ts >= thisMonth.from.getTime() && ts <= thisMonth.to.getTime()
  }))
  const investedTotal = total(rows)

  return {
    income,
    expenses,
    net,
    baseAmount,
    baseWasNegative,
    /* The widget's own number — what to invest. Always shown. */
    targetAmount,
    investedThisMonth,
    investedTotal,
    investmentsKnown,
    /* What the summary line prints, per the active view. */
    investedAmount: cfg.view === 'cumulative' ? investedTotal : investedThisMonth,
    /* No transactions last month at all — distinct from a real zero, and the
       display sub-task will want to word it differently. */
    hasData: income !== 0 || expenses !== 0,
  }
}

export function useInvestmentSettings() {
  const { prefs, update } = useUserPreferences()
  const { transactions, loading } = useTransactions()
  const {
    investments, loading: investmentsLoading, recordInvestment, undoInvestment,
  } = useInvestments()

  const settings = useMemo(() => migrateInvestmentSettings(prefs?.investment), [prefs])

  const write = useCallback((patch) => {
    const next = typeof patch === 'function' ? patch(settings) : { ...settings, ...patch }
    return update({ investment: migrateInvestmentSettings(next) })
  }, [settings, update])

  const setBase = useCallback(
    (base) => write({ base: INVESTMENT_BASES.includes(base) ? base : defaults().base }),
    [write],
  )
  const setPercent = useCallback((percent) => write({ percent: normalizePercent(percent) }), [write])
  const setView = useCallback(
    (view) => write({ view: INVESTMENT_VIEWS.includes(view) ? view : defaults().view }),
    [write],
  )

  const computed = useMemo(
    () => computeInvestment(transactions, settings, new Date(), investments),
    [transactions, settings, investments],
  )

  return {
    settings,
    setBase,
    setPercent,
    setView,
    ...computed,
    recordInvestment,
    undoInvestment,
    loading: loading || investmentsLoading,
  }
}
