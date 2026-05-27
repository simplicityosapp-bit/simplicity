import { useCallback, useEffect, useState } from 'react'
import {
  listScheduledMeetings, insertScheduledMeeting,
  updateScheduledMeeting as apiUpdate,
  removeScheduledMeeting as apiRemove,
} from '../lib/api/scheduledMeetings'

export function useScheduledMeetings() {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setMeetings(await listScheduledMeetings())
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
        const data = await listScheduledMeetings()
        if (active) { setMeetings(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const addMeeting = useCallback(async (payload) => {
    const row = await insertScheduledMeeting(payload)
    setMeetings((prev) => [...prev, row].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)))
    return row
  }, [])

  const updateMeeting = useCallback(async (id, patch) => {
    /* Optimistic — confirm/skip should feel instant. */
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    try {
      const row = await apiUpdate(id, patch)
      setMeetings((prev) => prev.map((m) => (m.id === id ? row : m)))
      return row
    } catch (e) {
      setError(e.message)
      refetch()
      throw e
    }
  }, [refetch])

  const removeMeeting = useCallback(async (id) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { meetings, loading, error, addMeeting, updateMeeting, removeMeeting, refetch }
}
