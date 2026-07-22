import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listSessions, insertSession, updateSession as apiUpdate, removeSession as apiRemove, restoreSession } from '../lib/api/sessions'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'

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

  /* `silent` suppresses the stand-alone "session deleted" undo. Use it when the
     caller is registering an undo of its own that covers this delete AND
     whatever else it changed — skipping a meeting removes its session but also
     flips the meeting's status, and pushUndo is single-level, so leaving both
     registered means the last one wins and the other change is stranded. */
  const removeSession = useCallback(async (id, { silent = false } = {}) => {
    const row = (qc.getQueryData(KEY) ?? []).find((s) => s.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((s) => s.id !== id))
    try {
      await apiRemove(id)
      if (!silent) {
        registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.session'), restoreFn: restoreSession, deleteFn: apiRemove })
      }
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
    return row
  }, [qc])

  /* Put a soft-deleted session back. Needed by callers that own a composite
     undo (see removeSession's `silent`). */
  const putBackSession = useCallback(async (id) => {
    try { await restoreSession(id) } finally { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { sessions, loading: isLoading, error: error?.message ?? null, addSession, updateSession, removeSession, putBackSession, refetch }
}
