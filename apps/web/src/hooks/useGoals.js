import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listGoals, insertGoal, updateGoal as apiUpdate, removeGoal as apiRemove, restoreGoal } from '../lib/api/goals'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'

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
    const row = (qc.getQueryData(KEY) ?? []).find((g) => g.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((g) => g.id !== id))
    try {
      await apiRemove(id)
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.goal'), restoreFn: restoreGoal, deleteFn: apiRemove })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { goals, loading: isLoading, error: error?.message ?? null, addGoal, updateGoal, removeGoal, refetch }
}
