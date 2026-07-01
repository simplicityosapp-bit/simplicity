import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listClientStatuses, insertClientStatus, removeClientStatus as apiRemove, restoreClientStatus } from '../lib/api/clientStatuses'
import { pushUndo } from '../lib/undo'

/* React-Query-backed: read on the clients screen + per card. Public API unchanged. */
const KEY = ['clientStatuses']

export function useClientStatuses() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listClientStatuses })
  const statuses = data ?? []

  const addStatus = useCallback(async (payload) => {
    const row = await insertClientStatus(payload)
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
        undo: async () => { try { await restoreClientStatus(id) } finally { qc.invalidateQueries({ queryKey: KEY }) } },
        redo: async () => {
          qc.setQueryData(KEY, (prev) => (prev ?? []).filter((s) => s.id !== id))
          try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
        },
      })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { statuses, loading: isLoading, error: error?.message ?? null, addStatus, removeStatus, refetch }
}
