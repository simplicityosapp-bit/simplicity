import { useCallback, useEffect, useState } from 'react'
import { listGroups, insertGroup, updateGroup as apiUpdate, removeGroup as apiRemove } from '../lib/api/groups'

export function useGroups() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGroups(await listGroups())
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
        const data = await listGroups()
        if (active) { setGroups(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addGroup = useCallback(async (payload) => {
    const row = await insertGroup(payload)
    setGroups((prev) => [row, ...prev])
    return row
  }, [])

  const updateGroup = useCallback(async (id, patch) => {
    const row = await apiUpdate(id, patch)
    setGroups((prev) => prev.map((g) => (g.id === id ? row : g)))
    return row
  }, [])

  const removeGroup = useCallback(async (id) => {
    setGroups((prev) => prev.filter((g) => g.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { groups, loading, error, addGroup, updateGroup, removeGroup, refetch }
}
