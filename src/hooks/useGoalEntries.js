import { useCallback, useEffect, useState } from 'react'
import { listGoalEntries, insertGoalEntry, removeGoalEntry as apiRemove, restoreGoalEntry } from '../lib/api/goalEntries'
import { pushUndo } from '../lib/undo'

export function useGoalEntries() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntries(await listGoalEntries())
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
        const data = await listGoalEntries()
        if (active) { setEntries(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addEntry = useCallback(async (payload) => {
    const row = await insertGoalEntry(payload)
    setEntries((prev) => [row, ...prev])
    return row
  }, [])

  const removeEntry = useCallback(async (id) => {
    const row = entries.find((en) => en.id === id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
    try {
      await apiRemove(id)
      if (row) pushUndo({
        label: 'העדכון נמחק',
        undo: async () => { try { await restoreGoalEntry(id) } finally { refetch() } },
        redo: async () => {
          setEntries((prev) => prev.filter((e) => e.id !== id))
          try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
        },
      })
    } catch (e) { setError(e.message); refetch() }
  }, [entries, refetch])

  return { entries, loading, error, addEntry, removeEntry, refetch }
}
