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

  /* Manual match: setting a client/project by hand flips matched_manually
     so the next sync won't overwrite EITHER link. Passing '' clears just
     that field. `field` is 'client_id' or 'project_id' (extensible). */
  const assignMatch = useCallback(async (id, field, value) => {
    const next = value || null
    setEvents((prev) => prev.map((ev) => {
      if (ev.id !== id) return ev
      const updated = { ...ev, [field]: next }
      /* matched_manually stays true while any manual link remains. */
      updated.matched_manually = !!(updated.client_id || updated.project_id)
      return updated
    }))
    /* Read the post-update row from state to derive matched_manually. */
    const row = events.find((ev) => ev.id === id) || {}
    const stillManual = !!((field === 'client_id' ? next : row.client_id) || (field === 'project_id' ? next : row.project_id))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ [field]: next, matched_manually: stillManual })
      .eq('id', id)
    if (e) setError(e.message)
  }, [events])

  const assignClient = useCallback((id, clientId) => assignMatch(id, 'client_id', clientId), [assignMatch])
  const assignProject = useCallback((id, projectId) => assignMatch(id, 'project_id', projectId), [assignMatch])

  return { events, loading, error, refetch, assignClient, assignProject }
}
