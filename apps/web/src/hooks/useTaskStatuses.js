import { useCallback, useEffect, useState } from 'react'
import {
  listTaskStatuses, insertTaskStatus, updateTaskStatus,
  removeTaskStatus as apiRemove, restoreTaskStatus,
} from '../lib/api/taskStatuses'
import { pushUndo } from '../lib/undo'

/* Custom task statuses (migration 0017). Each carries a meta_category
   ('open' | 'done') that the rest of the app rolls the task up to. */
export function useTaskStatuses() {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatuses(await listTaskStatuses())
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
        const data = await listTaskStatuses()
        if (active) { setStatuses(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addStatus = useCallback(async (payload) => {
    const row = await insertTaskStatus(payload)
    setStatuses((prev) => [...prev, row])
    return row
  }, [])

  const editStatus = useCallback(async (id, patch) => {
    const row = await updateTaskStatus(id, patch)
    setStatuses((prev) => prev.map((s) => (s.id === id ? row : s)))
    return row
  }, [])

  const removeStatus = useCallback(async (id) => {
    setStatuses((prev) => prev.filter((s) => s.id !== id))
    try {
      await apiRemove(id)
      pushUndo({
        label: 'הסטטוס נמחק',
        undo: async () => { try { await restoreTaskStatus(id) } finally { refetch() } },
        redo: async () => {
          setStatuses((prev) => prev.filter((s) => s.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { statuses, loading, error, addStatus, editStatus, removeStatus, refetch }
}
