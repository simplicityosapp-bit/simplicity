import { useCallback, useEffect, useState } from 'react'
import { listProjects, insertProject, updateProject as apiUpdateProject, removeProject as apiRemoveProject } from '../lib/api/projects'

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProjects(await listProjects())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await listProjects()
        if (active) { setProjects(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addProject = useCallback(async (payload) => {
    const row = await insertProject(payload)
    setProjects((prev) => [row, ...prev])
    return row
  }, [])

  const updateProject = useCallback(async (id, patch) => {
    const row = await apiUpdateProject(id, patch)
    setProjects((prev) => prev.map((p) => (p.id === id ? row : p)))
    return row
  }, [])

  const removeProject = useCallback(async (id) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    try { await apiRemoveProject(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { projects, loading, error, addProject, updateProject, removeProject, refetch }
}
