import { useCallback, useEffect, useState } from 'react'
import { listSessions, insertSession, removeSession as apiRemove } from '../lib/api/sessions'

export function useSessions() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSessions(await listSessions())
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
        const data = await listSessions()
        if (active) { setSessions(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addSession = useCallback(async (payload) => {
    const row = await insertSession(payload)
    setSessions((prev) => [row, ...prev])
    return row
  }, [])

  const removeSession = useCallback(async (id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { sessions, loading, error, addSession, removeSession, refetch }
}
