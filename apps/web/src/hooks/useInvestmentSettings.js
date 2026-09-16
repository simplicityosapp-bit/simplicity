import { useCallback, useMemo } from 'react'
import {
  INVESTMENT_BASES, INVESTMENT_VIEWS, normalizePercent, migrateInvestmentSettings, computeInvestment,
} from '@simplicity/core'
import { useUserPreferences } from './useUserPreferences'
import { useTransactions } from './useTransactions'
import { useInvestments } from './useInvestments'

/* ════════════════════════════════════════════════════════════════
   useInvestmentSettings — "כמה מההכנסה להפריש להשקעות".
   ════════════════════════════════════════════════════════════════
   Settings persist under user_preferences.investment (JSONB) — the
   same arrangement useReportsConfig uses for its sub-tree, so there
   is NO schema change and nothing to migrate for existing users.

   The settings shape and the whole calculation (computeInvestment) live
   in @simplicity/core/domain/investment, shared with the phone's
   investment row; re-exported here because the row and its tests import
   them from this module.
   ════════════════════════════════════════════════════════════════ */

export { INVESTMENT_BASES, INVESTMENT_VIEWS, normalizePercent, migrateInvestmentSettings, computeInvestment }

const defaults = () => migrateInvestmentSettings(null)

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
