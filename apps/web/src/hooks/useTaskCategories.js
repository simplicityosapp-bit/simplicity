import { useCallback, useEffect, useState } from 'react'
import {
  listTaskCategories, insertTaskCategory, updateTaskCategory,
  removeTaskCategory as apiRemove, restoreTaskCategory,
} from '../lib/api/taskCategories'
import { pushUndo } from '../lib/undo'

/* Custom task categories (migration 0017) — a name + color grouping axis
   for tasks, alongside status. */
export function useTaskCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCategories(await listTaskCategories())
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
        const data = await listTaskCategories()
        if (active) { setCategories(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addCategory = useCallback(async (payload) => {
    const row = await insertTaskCategory(payload)
    setCategories((prev) => [...prev, row])
    return row
  }, [])

  const editCategory = useCallback(async (id, patch) => {
    const row = await updateTaskCategory(id, patch)
    setCategories((prev) => prev.map((c) => (c.id === id ? row : c)))
    return row
  }, [])

  const removeCategory = useCallback(async (id) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
    try {
      await apiRemove(id)
      pushUndo({
        label: 'הקטגוריה נמחקה',
        undo: async () => { try { await restoreTaskCategory(id) } finally { refetch() } },
        redo: async () => {
          setCategories((prev) => prev.filter((c) => c.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { categories, loading, error, addCategory, editCategory, removeCategory, refetch }
}
