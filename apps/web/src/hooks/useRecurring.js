import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listRecurring, insertRecurring,
  updateRecurring as apiUpdateRecurring,
  removeRecurring as apiRemoveRecurring,
  restoreRecurring,
} from '../lib/api/recurring'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: shared cache instead of a fetch per mount, so an
   add/edit/delete of a recurring template shows across every consumer at once
   (previously each mount held its own copy). Public API unchanged. */
const KEY = ['recurringTemplates']

export function useRecurring() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listRecurring })
  const templates = data ?? []

  const addRecurring = useCallback(async (payload) => {
    const row = await insertRecurring(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updateRecurring = useCallback(async (id, patch) => {
    const row = await apiUpdateRecurring(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((t) => (t.id === id ? row : t)))
    return row
  }, [qc])

  const removeRecurring = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((t) => t.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.id !== id))
    try {
      await apiRemoveRecurring(id)
      if (row) pushUndo({
        label: 'הוראת הקבע נמחקה',
        undo: async () => { try { await restoreRecurring(id) } finally { qc.invalidateQueries({ queryKey: KEY }) } },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((t) => t.id !== id))
          try { await apiRemoveRecurring(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { templates, loading: isLoading, error: error?.message ?? null, addRecurring, updateRecurring, removeRecurring, refetch }
}
