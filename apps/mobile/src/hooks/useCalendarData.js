import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Scheduled meetings + synced calendar events + the subjects (clients/groups)
// for meeting names. scheduled_meetings has no deleted_at column → unfiltered.
async function fetchTable(name, { filterDeleted = true } = {}) {
  let q = supabase.from(name).select('*').limit(2000)
  if (filterDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

const EMPTY = { meetings: [], calendarEvents: [], clients: [], groups: [] }

export function useCalendarData() {
  const [state, setState] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [meetings, calendarEvents, clients, groups] = await Promise.all([
        fetchTable('scheduled_meetings', { filterDeleted: false }),
        fetchTable('calendar_events'),
        fetchTable('clients'),
        fetchTable('groups'),
      ])
      setState({ meetings, calendarEvents, clients, groups })
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, loading, error, refetch: load }
}
