import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listTransactions, insertTransaction, updateTransaction, removeTransaction as apiRemoveTx, restoreTransaction,
} from '../lib/api/transactions'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'
import { showError } from '../lib/toast'

/* React-Query-backed: the finance + home widgets that each fetched the
   whole transactions table now share one cached fetch. Public API
   unchanged. */
const KEY = ['transactions']

export function useTransactions() {
  const qc = useQueryClient()
  const { data, isLoading, error, fetchStatus, refetch } = useQuery({ queryKey: KEY, queryFn: listTransactions })
  const transactions = data ?? []

  const addTransaction = useCallback(async (payload) => {
    const row = await insertTransaction(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const editTransaction = useCallback(async (id, patch) => {
    const row = await updateTransaction(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((t) => (t.id === id ? row : t)))
    return row
  }, [qc])

  const setStatus = useCallback(async (id, status) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, status } : t))) // optimistic
    try {
      await updateTransaction(id, { status })
    } catch {
      qc.invalidateQueries({ queryKey: KEY })
      showError('עדכון התנועה נכשל — נסה/י שוב')
    }
  }, [qc])

  /* `silent` suppresses the stand-alone "transaction deleted" undo — the same
     escape hatch useSessions.removeSession carries, and for the same reason:
     pushUndo is single-level, so a caller that deletes this row AS PART of a
     larger action (an investment record and the expense it created) has to own
     the one undo that covers both, or the last registration wins and the rest
     is stranded half-applied. */
  const removeTransaction = useCallback(async (id, { silent = false } = {}) => {
    const row = (qc.getQueryData(KEY) ?? []).find((t) => t.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.id !== id))
    try {
      await apiRemoveTx(id)
      if (!silent) {
        registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.transaction'), restoreFn: restoreTransaction, deleteFn: apiRemoveTx })
      }
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { transactions, loading: isLoading, unreachable: !!error || (fetchStatus === 'paused' && data === undefined), error: error?.message ?? null, addTransaction, editTransaction, setStatus, removeTransaction, refetch }
}
