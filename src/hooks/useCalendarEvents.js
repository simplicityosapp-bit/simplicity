import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* Reads the synced `calendar_events` (own rows via RLS) and lets the user
   assign a client by hand to an unmatched event. The sync upsert itself
   is server-side; here we only read + the manual match. */

async function fetchCalendarEvents() {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .is('deleted_at', null)
    .order('start_time', { ascending: false })
  if (error) throw error
  return data || []
}

export function useCalendarEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  /* Initial load — state is only set in the async continuation. */
  useEffect(() => {
    let active = true
    fetchCalendarEvents()
      .then((rows) => { if (active) { setEvents(rows); setError(null) } })
      .catch((e) => { if (active) { setError(e.message); setEvents([]) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  /* Manual refresh (from the sync button / OAuth return). */
  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await fetchCalendarEvents())
      setError(null)
    } catch (e) {
      setError(e.message); setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  /* Manual match: setting a client by hand flips matched_manually so the
     next sync won't overwrite it. Passing '' clears the match. */
  const assignClient = useCallback(async (id, clientId) => {
    const next = clientId || null
    setEvents((prev) => prev.map((ev) => (ev.id === id
      ? { ...ev, client_id: next, matched_manually: !!next }
      : ev)))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ client_id: next, matched_manually: !!next })
      .eq('id', id)
    if (e) setError(e.message)
  }, [])

  return { events, loading, error, refetch, assignClient }
}
