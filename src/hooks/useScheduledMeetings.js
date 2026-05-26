import { useCallback, useEffect, useState } from 'react'
import { listScheduledMeetings, insertScheduledMeeting, removeScheduledMeeting as apiRemove } from '../lib/api/scheduledMeetings'

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

  const removeMeeting = useCallback(async (id) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id))
    try { await apiRemove(id) } catch (e) { setError(e.message); refetch() }
  }, [refetch])

  return { meetings, loading, error, addMeeting, removeMeeting, refetch }
}
