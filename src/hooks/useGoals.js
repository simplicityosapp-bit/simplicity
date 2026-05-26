import { useCallback, useEffect, useState } from 'react'
import { listGoals, insertGoal, updateGoal as apiUpdate, removeGoal as apiRemove } from '../lib/api/goals'

export function useGoals() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGoals(await listGoals())
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
        const data = await listGoals()
        if (active) { setGoals(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addGoal = useCallback(async (payload) => {
    const row = await insertGoal(payload)
    setGoals((prev) => [row, ...prev])
    return row
  }, [])

  const updateGoal = useCallback(async (id, patch) => {
    const row = await apiUpdate(id, patch)
    setGoals((prev) => prev.map((g) => (g.id === id ? row : g)))
    return row
  }, [])

  const removeGoal = useCallback(async (id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { goals, loading, error, addGoal, updateGoal, removeGoal, refetch }
}
