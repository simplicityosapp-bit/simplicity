import { useCallback, useEffect, useState } from 'react'
import { listClientStatuses, insertClientStatus, removeClientStatus as apiRemove, restoreClientStatus } from '../lib/api/clientStatuses'
import { pushUndo } from '../lib/undo'

export function useClientStatuses() {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatuses(await listClientStatuses())
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
        const data = await listClientStatuses()
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
    const row = await insertClientStatus(payload)
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
        undo: async () => { try { await restoreClientStatus(id) } finally { refetch() } },
        redo: async () => {
          setStatuses((prev) => prev.filter((s) => s.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [statuses, refetch])

  return { statuses, loading, error, addStatus, removeStatus, refetch }
}
