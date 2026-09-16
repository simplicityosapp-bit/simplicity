/* ════════════════════════════════════════════════════════════════
   INVESTMENT PERCENTAGE — "כמה מההכנסה להפריש להשקעות". Pure, shared.
   ════════════════════════════════════════════════════════════════
   Moved from apps/web/src/hooks/useInvestmentSettings.js so the phone's
   investment row computes the same figure the web row does; web re-exports
   these from there. The comments below are the web originals.

   Settings persist under user_preferences.investment (JSONB):
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
                      explicitly confirmed.

   Income and net are read through financeQuery, the app's canonical lens
   over transactions, so this widget counts exactly what the finance
   screen's own header counts: confirmed rows only.
   ════════════════════════════════════════════════════════════════ */

import { financeQuery, currentMonthRange, previousMonthRange, type Tx } from './finance'
import { toLocalDate } from './scheduledMeetings'

export const INVESTMENT_BASES = ['income', 'net'] as const
export const INVESTMENT_VIEWS = ['monthly', 'cumulative'] as const

export type InvestmentBase = typeof INVESTMENT_BASES[number]
export type InvestmentView = typeof INVESTMENT_VIEWS[number]

export interface InvestmentSettings {
  base: InvestmentBase
  percent: number
  view: InvestmentView
}

export interface InvestmentRecord {
  id?: string
  amount?: number | string | null
  invested_on?: string | null
  transaction_id?: string | null
  note?: string | null
  [key: string]: unknown
}

/* 10% is a starting point, not a recommendation — the whole widget exists
   so the user picks their own number. 'monthly' is the required default. */
function defaults(): InvestmentSettings {
  return { base: 'income', percent: 10, view: 'monthly' }
}

/* Coerce a percentage to something safe to compute with: a finite number in
   0–100, at most two decimals. Anything else falls back to the default —
   an empty input or a stray string must not turn the amount into NaN. */
export function normalizePercent(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  if (!Number.isFinite(n)) return defaults().percent
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100
}

export function migrateInvestmentSettings(cfg?: Partial<InvestmentSettings> | Record<string, unknown> | null): InvestmentSettings {
  const out = { ...defaults(), ...(cfg || {}) } as InvestmentSettings
  if (!(INVESTMENT_BASES as readonly string[]).includes(out.base)) out.base = defaults().base
  if (!(INVESTMENT_VIEWS as readonly string[]).includes(out.view)) out.view = defaults().view
  out.percent = normalizePercent(out.percent)
  return out
}

/* The whole calculation — no React, no Supabase. `now` and `month` are
   injectable so a test can stand on a fixed month. `month` is the month the
   finance screen is parked on (any Date inside it), defaulting to the month
   containing `now`. Returns everything the row needs to both print a figure
   and explain it. */
export function computeInvestment(
  transactions: Tx[] | null | undefined,
  settings: Partial<InvestmentSettings> | null | undefined,
  now: Date = new Date(),
  investments: InvestmentRecord[] | null = null,
  month: Date | null = null,
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
  const sumIncome = (r: { from: Date; to: Date }) => financeQuery({ type: 'income', from: r.from, to: r.to, source })
    .reduce((s, f) => s + (f.amount || 0), 0)

  /* Which month the percentage is taken of: the month on screen, so the
     widget can never disagree with the header above it. A month that has
     taken nothing in yet falls back ONE step to the month before, and the row
     says so out loud; never a search for the last month that had money. */
  const selectedMonthIncome = sumIncome(selected)
  const fellBack = selectedMonthIncome === 0
  const range = fellBack ? previousMonthRange(anchor) : selected

  const sum = (type: string) => financeQuery({ type, ...range, source })
    .reduce((s, f) => s + (f.amount || 0), 0)

  const income = sum('income')
  const expenses = sum('expense')
  const net = income - expenses
  const baseAmount = cfg.base === 'net' ? net : income

  /* A losing month yields a negative base, and "invest −₪800" is not a thing.
     Floor the target at zero and flag it so the row can say WHY it reads ₪0. */
  const baseWasNegative = baseAmount < 0
  const targetAmount = baseWasNegative ? 0 : (cfg.percent / 100) * baseAmount

  /* `null` history means it isn't loaded — NOT "you have invested ₪0". */
  const investmentsKnown = Array.isArray(investments)
  const total = (list: InvestmentRecord[]) => list.reduce((s, r) => s + (Number(r?.amount) || 0), 0)

  /* Tracks the month ON SCREEN, not the basis month. toLocalDate, not new
     Date — invested_on is a DATE column, and UTC midnight would file the 1st
     under the previous month west of Greenwich. */
  const rowsInMonth = rows.filter((r) => {
    if (!r?.invested_on) return false
    const ts = toLocalDate(r.invested_on).getTime()
    return ts >= selected.from.getTime() && ts <= selected.to.getTime()
  })
  const investedInMonth = total(rowsInMonth)
  const investedTotal = total(rows)

  /* No transactions in the basis month at all — distinct from a real zero. */
  const hasData = income !== 0 || expenses !== 0

  const nowMonth = currentMonthRange(now)
  const isCurrentMonth = selected.from.getTime() === nowMonth.from.getTime()

  return {
    income,
    expenses,
    net,
    selectedMonthIncome,
    selectedMonth: selected.from,
    /* With no data anywhere there is no source to name — report the month on screen. */
    basisMonth: hasData ? range.from : selected.from,
    basisFellBack: fellBack && hasData,
    isCurrentMonth,
    baseAmount,
    baseWasNegative,
    targetAmount,
    investedInMonth,
    investedTotal,
    investmentsKnown,
    investedAmount: cfg.view === 'cumulative' ? investedTotal : investedInMonth,
    /* The rows behind that figure, newest first — the same set, per view. */
    investedRows: (cfg.view === 'cumulative' ? rows.slice() : rowsInMonth.slice())
      .sort((a, b) => toLocalDate(b.invested_on as string).getTime() - toLocalDate(a.invested_on as string).getTime()),
    hasData,
  }
}
