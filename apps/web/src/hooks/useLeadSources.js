import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listLeadSources, insertLeadSource, removeLeadSource as apiRemove, restoreLeadSource } from '../lib/api/leadSources'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: read on the leads screen + filter modal. Public API unchanged. */
const KEY = ['leadSources']

export function useLeadSources() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listLeadSources })
  const sources = data ?? []

  const addSource = useCallback(async (payload) => {
    const row = await insertLeadSource(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row])
    return row
  }, [qc])

  const removeSource = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((s) => s.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((s) => s.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'המקור נמחק',
        undo: async () => { try { await restoreLeadSource(id) } finally { qc.invalidateQueries({ queryKey: KEY }) } },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((s) => s.id !== id))
          try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { sources, loading: isLoading, error: error?.message ?? null, addSource, removeSource, refetch }
}
