import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listGoalEntries, insertGoalEntry, removeGoalEntry as apiRemove, restoreGoalEntry } from '../lib/api/goalEntries'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: shared across moon + quick-update widgets. Public API unchanged. */
const KEY = ['goalEntries']

export function useGoalEntries() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listGoalEntries })
  const entries = data ?? []

  const addEntry = useCallback(async (payload) => {
    const row = await insertGoalEntry(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const removeEntry = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((en) => en.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((e) => e.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'העדכון נמחק',
        undo: async () => { try { await restoreGoalEntry(id) } finally { qc.invalidateQueries({ queryKey: KEY }) } },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((e) => e.id !== id))
          try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { entries, loading: isLoading, error: error?.message ?? null, addEntry, removeEntry, refetch }
}
