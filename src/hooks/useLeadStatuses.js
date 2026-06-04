import { useCallback, useEffect, useState } from 'react'
import { listLeadStatuses, insertLeadStatus, updateLeadStatus as apiUpdate, removeLeadStatus as apiRemove, restoreLeadStatus } from '../lib/api/leadStatuses'
import { pushUndo } from '../lib/undo'

export function useLeadStatuses() {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatuses(await listLeadStatuses())
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
        const data = await listLeadStatuses()
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
    const row = await insertLeadStatus(payload)
    setStatuses((prev) => [...prev, row])
    return row
  }, [])

  const removeStatus = useCallback(async (id) => {
    const row = statuses.find((s) => s.id === id)
    setStatuses((prev) => prev.filter((s) => s.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'תת-הסטטוס נמחק',
        undo: async () => { try { await restoreLeadStatus(id) } finally { refetch() } },
        redo: async () => {
          setStatuses((prev) => prev.filter((s) => s.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [statuses, refetch])

  /* Optimistic patch (used for drag-reorder sort_order). */
  const updateStatus = useCallback(async (id, patch) => {
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    try { await apiUpdate(id, patch) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { statuses, loading, error, addStatus, updateStatus, removeStatus, refetch }
}
