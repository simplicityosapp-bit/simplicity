import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { showError } from '../lib/toast'
import { selectAllRows } from '../lib/api/paginate'

/* Reads the synced `calendar_events` (own rows via RLS) and lets the user
   assign an entity by hand to an unmatched event. The sync upsert itself
   is server-side; here we only read + the manual match. */

/* All link fields an event can carry — any one set ⇒ the event counts as
   manually matched (frozen against the next sync). */
const MATCH_FIELDS = ['client_id', 'project_id', 'lead_id', 'group_id']

async function fetchCalendarEvents() {
  return selectAllRows(() => supabase
    .from('calendar_events')
    .select('*')
    .is('deleted_at', null)
    .order('start_time', { ascending: false }))
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

  /* Manual match: setting a client/project/lead/group by hand flips
     matched_manually so the next sync won't overwrite ANY link. Passing ''
     clears just that field; matched_manually stays true only while at least
     one link remains. The caller passes the current `ev` row (from render)
     so the flag is derived from fresh values — no stale closure, and no
     dependency on the `events` array. On a failed write we refetch to undo
     the optimistic change. */
  const assignMatch = useCallback(async (ev, field, value) => {
    const next = value || null
    const updated = { ...ev, [field]: next }
    const stillManual = MATCH_FIELDS.some((f) => !!updated[f])
    setEvents((prev) => prev.map((row) => (row.id === ev.id
      ? { ...row, [field]: next, matched_manually: stillManual }
      : row)))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ [field]: next, matched_manually: stillManual })
      .eq('id', ev.id)
    if (e) { setError(e.message); showError('שיוך האירוע נכשל — נסה/י שוב'); refetch() }
  }, [refetch])

  const assignClient = useCallback((ev, clientId) => assignMatch(ev, 'client_id', clientId), [assignMatch])
  const assignProject = useCallback((ev, projectId) => assignMatch(ev, 'project_id', projectId), [assignMatch])
  const assignLead = useCallback((ev, leadId) => assignMatch(ev, 'lead_id', leadId), [assignMatch])
  const assignGroup = useCallback((ev, groupId) => assignMatch(ev, 'group_id', groupId), [assignMatch])

  /* Hide a synced event from the app view (soft-delete). Used to resolve a
     calendar duplicate when the user keeps the app meeting. NOTE: one-way
     sync means a future sync may re-create the row — the calling UI warns
     about this. Optimistic; refetch on failure. */
  const dismissEvent = useCallback(async (ev) => {
    setEvents((prev) => prev.filter((row) => row.id !== ev.id))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ev.id)
    if (e) { setError(e.message); showError('הסתרת האירוע נכשלה — נסה/י שוב'); refetch() }
  }, [refetch])

  /* OWN + edit a synced event: setting owned=true detaches it from the
     one-way sync (the Edge Function skips owned rows — migration 0023), so
     the new title/time stick instead of being overwritten on the next sync.
     `patch` carries the editable fields (title / start_time / end_time). */
  const updateEvent = useCallback(async (ev, patch) => {
    const next = { ...patch, owned: true }
    setEvents((prev) => prev.map((row) => (row.id === ev.id ? { ...row, ...next } : row)))
    const { error: e } = await supabase
      .from('calendar_events')
      .update(next)
      .eq('id', ev.id)
    if (e) { setError(e.message); showError('עדכון האירוע נכשל — נסה/י שוב'); refetch() }
  }, [refetch])

  /* OWN + delete a synced event for good. owned=true makes the soft-delete
     survive future syncs (without it, the sync resets deleted_at to null and
     the event reappears). Optimistic; refetch on failure. */
  const deleteEvent = useCallback(async (ev) => {
    setEvents((prev) => prev.filter((row) => row.id !== ev.id))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ owned: true, deleted_at: new Date().toISOString() })
      .eq('id', ev.id)
    if (e) { setError(e.message); showError('מחיקת האירוע נכשלה — נסה/י שוב'); refetch() }
  }, [refetch])

  return { events, loading, error, refetch, assignClient, assignProject, assignLead, assignGroup, dismissEvent, updateEvent, deleteEvent }
}
