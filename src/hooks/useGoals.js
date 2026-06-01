import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listGoals, insertGoal, updateGoal as apiUpdate, removeGoal as apiRemove } from '../lib/api/goals'

/* React-Query-backed: shared across moon/attention/quick-row widgets +
   moon-glance + finance chart. Public API unchanged. */
const KEY = ['goals']

export function useGoals() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listGoals })
  const goals = data ?? []

  const addGoal = useCallback(async (payload) => {
    const row = await insertGoal(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updateGoal = useCallback(async (id, patch) => {
    const row = await apiUpdate(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((g) => (g.id === id ? row : g)))
    return row
  }, [qc])

  const removeGoal = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((g) => g.id !== id))
    try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { goals, loading: isLoading, error: error?.message ?? null, addGoal, updateGoal, removeGoal, refetch }
}
