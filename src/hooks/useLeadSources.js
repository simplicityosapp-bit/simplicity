import { useCallback, useEffect, useState } from 'react'
import { listLeadSources, insertLeadSource, removeLeadSource as apiRemove, restoreLeadSource } from '../lib/api/leadSources'
import { pushUndo } from '../lib/undo'

export function useLeadSources() {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSources(await listLeadSources())
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
        const data = await listLeadSources()
        if (active) { setSources(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addSource = useCallback(async (payload) => {
    const row = await insertLeadSource(payload)
    setSources((prev) => [...prev, row])
    return row
  }, [])

  const removeSource = useCallback(async (id) => {
    const row = sources.find((s) => s.id === id)
    setSources((prev) => prev.filter((s) => s.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'המקור נמחק',
        undo: async () => { try { await restoreLeadSource(id) } finally { refetch() } },
        redo: async () => {
          setSources((prev) => prev.filter((s) => s.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [sources, refetch])

  return { sources, loading, error, addSource, removeSource, refetch }
}
