import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listClientStatuses, insertClientStatus, updateClientStatus as apiUpdate, removeClientStatus as apiRemove, restoreClientStatus } from '../lib/api/clientStatuses'
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

  /* Optimistic patch — renaming, and moving a status between meta groups.
     The API call existed from the start and had no caller for months: the
     only editor in the app could add and delete but not rename, so fixing a
     typo meant deleting the status (reassigning everyone on it) and building
     it again. */
  const updateStatus = useCallback(async (id, patch) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)))
    try { await apiUpdate(id, patch) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { statuses, loading: isLoading, error: error?.message ?? null, addStatus, updateStatus, removeStatus, refetch }
}
