import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listLeadSources, insertLeadSource, updateLeadSource as apiUpdate, removeLeadSource as apiRemove, restoreLeadSource } from '../lib/api/leadSources'
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

  /* Optimistic patch — the colour, today. `updateLeadSource` had shipped in
     the API with no caller since the table existed, so a source's colour was
     whatever was picked in the second it was created and could never be
     changed. */
  const updateSource = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)))
    try { await apiUpdate(id, patch) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { sources, loading: isLoading, error: error?.message ?? null, addSource, updateSource, removeSource, refetch }
}
