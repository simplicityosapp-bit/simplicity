import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listGoalCategories, insertGoalCategory, updateGoalCategory, removeGoalCategory as apiRemove } from '../lib/api/goalCategories'

/* React-Query-backed: shared across moon/attention/quick-row widgets +
   moon-glance + finance chart. Public API unchanged. */
const KEY = ['goalCategories']

export function useGoalCategories() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listGoalCategories })
  const categories = data ?? []

  const addCategory = useCallback(async (payload) => {
    const row = await insertGoalCategory(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row])
    return row
  }, [qc])

  const updateCategory = useCallback(async (id, patch) => {
    const row = await updateGoalCategory(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((c) => (c.id === id ? row : c)))
    return row
  }, [qc])

  const removeCategory = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((c) => c.id !== id))
    try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { categories, loading: isLoading, error: error?.message ?? null, addCategory, updateCategory, removeCategory, refetch }
}
