import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listSessions, insertSession, updateSession as apiUpdate, removeSession as apiRemove } from '../lib/api/sessions'

/* React-Query-backed: shared across moon + attention widgets. Public API unchanged. */
const KEY = ['sessions']

export function useSessions() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listSessions })
  const sessions = data ?? []

  const addSession = useCallback(async (payload) => {
    const row = await insertSession(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updateSession = useCallback(async (id, patch) => {
    const row = await apiUpdate(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((s) => (s.id === id ? row : s)))
    return row
  }, [qc])

  const removeSession = useCallback(async (id) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((s) => s.id !== id))
    try { await apiRemove(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { sessions, loading: isLoading, error: error?.message ?? null, addSession, updateSession, removeSession, refetch }
}
