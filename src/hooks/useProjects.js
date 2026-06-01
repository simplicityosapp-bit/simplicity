import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listProjects, insertProject, updateProject as apiUpdateProject, removeProject as apiRemoveProject } from '../lib/api/projects'

/* React-Query-backed: shared cache across screens. Public API unchanged. */
const KEY = ['projects']

export function useProjects() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: listProjects })
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
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((p) => p.id !== id))
    try { await apiRemoveProject(id) } catch { qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { projects, loading: isLoading, error: error?.message ?? null, addProject, updateProject, removeProject, refetch }
}
