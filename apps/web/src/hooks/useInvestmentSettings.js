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

     targetAmount   — the widget itself, ALWAYS on screen. percent × the
                      income (or net) of the month the finance screen is
                      parked on. The חודשי/מצטבר toggle does not touch it.

     investedAmount — the record of what the user actually put in, and the
                      ONLY thing the חודשי/מצטבר toggle switches:
                        monthly    → invested during the month on screen
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
   and `month` are injectable so a test can stand on a fixed month.

   `month` is the month the finance screen is parked on — any Date inside it.
   Defaults to the month containing `now`, so a caller that never navigates
   still gets the month in progress.

   Returns everything the row needs to both print a figure and explain it. */
export function computeInvestment(
  transactions, settings, now = new Date(), investments = null, month = null,
) {
  const cfg = migrateInvestmentSettings(settings)
  const rows = Array.isArray(investments) ? investments : []

  /* Expenses created BY an investment are excluded from the base, or the
     target eats itself: ₪800 recorded in August shrinks August's net, which
     is what the August target is computed from, and the figure spirals down
     every time it is read. Excluded by transaction id — never by category
     name, which the user can rename at will. */
  const investedTxIds = new Set(rows.map((r) => r?.transaction_id).filter(Boolean))
  const source = investedTxIds.size
    ? (transactions || []).filter((t) => !investedTxIds.has(t.id))
    : (transactions || [])

  const anchor = month || now
  const selected = currentMonthRange(anchor)
  const sumIncome = (r) => financeQuery({ type: 'income', from: r.from, to: r.to, source })
    .reduce((s, f) => s + (f.amount || 0), 0)

  /* ── Which month the percentage is taken of ──
     The month on screen, so the widget can never disagree with the header
     above it. A month that has taken nothing in yet — the 2nd of a new one,
     most obviously — has no income to take a percentage of, so the basis
     falls back to the month before it and the row says so out loud.

     ONE step back, never a search for the last month that had money. A figure
     silently drawn from three months ago is one the user cannot locate, and
     "why is this number here" is the exact question the fallback exists to
     answer. When the previous month is empty too, `hasData` goes false and the
     row says *that* instead. */
  const selectedMonthIncome = sumIncome(selected)
  const fellBack = selectedMonthIncome === 0
  const range = fellBack ? previousMonthRange(anchor) : selected

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

  /* Tracks the month ON SCREEN, not the basis month. When the basis has fallen
     back, the two differ on purpose: "what you set aside during August" is
     still an August question even while the target is quoting July. */
  const rowsInMonth = rows.filter((r) => {
    if (!r?.invested_on) return false
    /* toLocalDate, not new Date — invested_on is a DATE column, and reading it
       as UTC midnight would file the 1st under the previous month west of
       Greenwich, so "invested this month" would quietly drop it. */
    const ts = toLocalDate(r.invested_on).getTime()
    return ts >= selected.from.getTime() && ts <= selected.to.getTime()
  })
  const investedInMonth = total(rowsInMonth)
  const investedTotal = total(rows)

  /* No transactions in the basis month at all — distinct from a real zero, and
     the row words it differently. */
  const hasData = income !== 0 || expenses !== 0

  /* Is the month on screen the one actually in progress? The row needs it to
     word its labels ("הושקע החודש" vs "הושקע ביוני") and to decide whether
     pressing "השקעתי" can silently stamp today. */
  const nowMonth = currentMonthRange(now)
  const isCurrentMonth = selected.from.getTime() === nowMonth.from.getTime()

  return {
    income,
    expenses,
    net,
    selectedMonthIncome,
    /* The month on screen, and the month the maths actually used. Equal unless
       the basis fell back. Both are returned so the row can label the figure
       with its true source rather than with whatever is on screen.

       With no data anywhere, the fallback month is named as the basis only in
       the arithmetic's bookkeeping sense — it contributed nothing, and the row
       would be captioning a ₪0 with a month the user has no reason to think
       about. Report the month on screen instead: there is no source to name. */
    selectedMonth: selected.from,
    basisMonth: hasData ? range.from : selected.from,
    /* The month on screen took nothing in, so the figure comes from the one
       before it — true and worth saying out loud, not an error. Gated on
       hasData: with nothing in either month there is no figure to explain,
       and the "no data" note covers that case on its own. Two notes saying
       different things would just be noise. */
    basisFellBack: fellBack && hasData,
    isCurrentMonth,
    baseAmount,
    baseWasNegative,
    /* The widget's own number — what to invest. Always shown. */
    targetAmount,
    investedInMonth,
    investedTotal,
    investmentsKnown,
    /* What the summary line prints, per the active view. */
    investedAmount: cfg.view === 'cumulative' ? investedTotal : investedInMonth,
    /* The rows BEHIND that figure, newest first — the same set, per view, so a
       list built from this can never disagree with the total above it. Until
       now nothing returned them, which is why `undoInvestment` existed with no
       surface that could call it: recording money was one-way. */
    investedRows: (cfg.view === 'cumulative' ? rows.slice() : rowsInMonth.slice())
      .sort((a, b) => toLocalDate(b.invested_on).getTime() - toLocalDate(a.invested_on).getTime()),
    hasData,
  }
}

/* `month` is the month the finance screen is showing. Passed straight through
   to computeInvestment; omitting it means "the month in progress". */
export function useInvestmentSettings(month = null) {
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

  /* Keyed on the month's timestamp, not the Date object: the screen builds a
     fresh `new Date(...)` on every month change, and an object identity in the
     dep list would recompute on any re-render that happened to make a new one. */
  const monthKey = month ? month.getTime() : null
  const computed = useMemo(
    () => computeInvestment(transactions, settings, new Date(), investments, month),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [transactions, settings, investments, monthKey],
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
