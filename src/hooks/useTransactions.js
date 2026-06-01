import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listTransactions, insertTransaction, updateTransaction, removeTransaction as apiRemoveTx,
} from '../lib/api/transactions'

/* React-Query-backed: the finance + home widgets that each fetched the
   whole transactions table now share one cached fetch. Public API
   unchanged. */
const KEY = ['transactions']

export function useTransactions() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listTransactions })
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
    }
  }, [qc])

  const removeTransaction = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.id !== id))
    try { await apiRemoveTx(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { transactions, loading: isLoading, error: error?.message ?? null, addTransaction, editTransaction, setStatus, removeTransaction, refetch }
}
