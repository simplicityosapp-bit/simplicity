import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listGroups, insertGroup, updateGroup as apiUpdate, removeGroup as apiRemove, restoreGroup } from '../lib/api/groups'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '../i18n'

/* React-Query-backed: shared across meeting-confirm + chips widgets. Public API unchanged. */
const KEY = ['groups']

export function useGroups() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listGroups })
  const groups = data ?? []

  const addGroup = useCallback(async (payload) => {
    const row = await insertGroup(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updateGroup = useCallback(async (id, patch) => {
    const row = await apiUpdate(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((g) => (g.id === id ? row : g)))
    return row
  }, [qc])

  const removeGroup = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((g) => g.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((g) => g.id !== id))
    try {
      await apiRemove(id)
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.group'), restoreFn: restoreGroup, deleteFn: apiRemove })
    } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { groups, loading: isLoading, error: error?.message ?? null, addGroup, updateGroup, removeGroup, refetch }
}
