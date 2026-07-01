import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listLeadStatuses, insertLeadStatus, updateLeadStatus as apiUpdate, removeLeadStatus as apiRemove, restoreLeadStatus } from '../lib/api/leadStatuses'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: read on the leads screen + per card. Public API unchanged. */
const KEY = ['leadStatuses']

export function useLeadStatuses() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listLeadStatuses })
  const statuses = data ?? []

  const addStatus = useCallback(async (payload) => {
    const row = await insertLeadStatus(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row])
    return row
  }, [qc])

  const removeStatus = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((s) => s.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((s) => s.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'תת-הסטטוס נמחק',
        undo: async () => { try { await restoreLeadStatus(id) } finally { qc.invalidateQueries({ queryKey: KEY }) } },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((s) => s.id !== id))
          try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  /* Optimistic patch (used for drag-reorder sort_order). */
  const updateStatus = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)))
    try { await apiUpdate(id, patch) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { statuses, loading: isLoading, error: error?.message ?? null, addStatus, updateStatus, removeStatus, refetch }
}
