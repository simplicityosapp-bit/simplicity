import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listProjects, insertProject, updateProject as apiUpdateProject, removeProject as apiRemoveProject, restoreProject } from '../lib/api/projects'
import { registerDeleteUndo } from '../lib/undoActions'
import i18n from '@simplicity/core/i18n'
import { revertWrite } from '../lib/revertWrite'

/* React-Query-backed: shared cache across screens. Public API unchanged. */
const KEY = ['projects']

export function useProjects() {
  const qc = useQueryClient()
  const { data, isLoading, isFetching, error, fetchStatus, refetch } = useQuery({ queryKey: KEY, queryFn: listProjects })
  const projects = data ?? []

  const addProject = useCallback(async (payload) => {
    const row = await insertProject(payload)
    qc.setQueryData(KEY, (prev) => [row, ...(prev ?? [])])
    return row
  }, [qc])

  const updateProject = useCallback(async (id, patch) => {
    const row = await apiUpdateProject(id, patch)
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((p) => (p.id === id ? row : p)))
    return row
  }, [qc])

  const removeProject = useCallback(async (id) => {
    const row = (qc.getQueryData(KEY) ?? []).find((p) => p.id === id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((p) => p.id !== id))
    try {
      await apiRemoveProject(id)
      registerDeleteUndo({ qc, key: KEY, row, label: i18n.t('components:undo.deleted.project'), restoreFn: restoreProject, deleteFn: apiRemoveProject })
    } catch { revertWrite(qc, { queryKey: KEY }) }
  }, [qc])

  /* `unreachable` names the two ways this read can come back with nothing to
     say: it failed, or it never ran (offline → fetchStatus 'paused', which is
     neither loading nor an error). Without it the screen renders `[]` as fact
     and tells the user they have no projects. Same contract as the other
     twelve hooks — see useClients / useReportsData. */
  return {
    projects,
    loading: isLoading,
    unreachable: !!error || (fetchStatus === 'paused' && data === undefined),
    refetching: isFetching,
    error: error?.message ?? null,
    addProject,
    updateProject,
    removeProject,
    refetch,
  }
}
