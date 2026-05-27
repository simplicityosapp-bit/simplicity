import { useCallback, useEffect, useState } from 'react'
import {
  listCategories, insertCategory,
  updateCategory as apiUpdateCategory,
  removeCategory as apiRemoveCategory,
} from '../lib/api/categories'

export function useCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCategories(await listCategories())
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
        const data = await listCategories()
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
    const row = await insertCategory(payload)
    setCategories((prev) => [...prev, row])
    return row
  }, [])

  const updateCategory = useCallback(async (id, patch) => {
    const row = await apiUpdateCategory(id, patch)
    setCategories((prev) => prev.map((c) => (c.id === id ? row : c)))
    return row
  }, [])

  const removeCategory = useCallback(async (id) => {
    setCategories((prev) => prev.filter((c) => c.id !== id))
    try { await apiRemoveCategory(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { categories, loading, error, addCategory, updateCategory, removeCategory, refetch }
}
