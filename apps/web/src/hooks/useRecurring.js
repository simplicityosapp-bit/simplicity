import { useCallback, useEffect, useState } from 'react'
import {
  listRecurring, insertRecurring,
  updateRecurring as apiUpdateRecurring,
  removeRecurring as apiRemoveRecurring,
  restoreRecurring,
} from '../lib/api/recurring'
import { pushUndo } from '../lib/undo'

export function useRecurring() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTemplates(await listRecurring())
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
        const data = await listRecurring()
        if (active) { setTemplates(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addRecurring = useCallback(async (payload) => {
    const row = await insertRecurring(payload)
    setTemplates((prev) => [row, ...prev])
    return row
  }, [])

  const updateRecurring = useCallback(async (id, patch) => {
    const row = await apiUpdateRecurring(id, patch)
    setTemplates((prev) => prev.map((t) => (t.id === id ? row : t)))
    return row
  }, [])

  const removeRecurring = useCallback(async (id) => {
    const row = templates.find((t) => t.id === id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    try {
      await apiRemoveRecurring(id)
      if (row) pushUndo({
        label: 'הוראת הקבע נמחקה',
        undo: async () => { try { await restoreRecurring(id) } finally { refetch() } },
        redo: async () => {
          setTemplates((prev) => prev.filter((t) => t.id !== id))
          try { await apiRemoveRecurring(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [templates, refetch])

  return { templates, loading, error, addRecurring, updateRecurring, removeRecurring, refetch }
}
