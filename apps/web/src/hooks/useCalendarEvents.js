import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { showError } from '../lib/toast'
import { selectAllRows } from '../lib/api/paginate'
import i18n from '@simplicity/core/i18n'

/* Reads the synced `calendar_events` (own rows via RLS) and lets the user
   assign an entity by hand to an unmatched event. The sync upsert itself
   is server-side; here we only read + the manual match.

   React-Query-backed on ['calendarEvents'] so concurrently-mounted consumers
   share ONE cache: Home mounts this in both AttentionWidget and ChipsWidget,
   and the old per-mount useState meant dismissing a calendar-duplicate in one
   left the "פגישות היום" chip (the other instance) stale. `staleTime: 0`
   preserves the previous refetch-on-every-mount behaviour the Google-sync path
   relies on (the calendar screen's sync button / OAuth return call refetch()),
   while the shared cache + optimistic setQueryData keep every consumer in sync. */

/* All link fields an event can carry — any one set ⇒ the event counts as
   manually matched (frozen against the next sync). */
const MATCH_FIELDS = ['client_id', 'project_id', 'lead_id', 'group_id']
const KEY = ['calendarEvents']

async function fetchCalendarEvents() {
  return selectAllRows(() => supabase
    .from('calendar_events')
    .select('*')
    .is('deleted_at', null)
    .order('start_time', { ascending: false }))
}

export function useCalendarEvents() {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: fetchCalendarEvents, staleTime: 0 })
  const events = data ?? []

  /* Manual match: setting a client/project/lead/group by hand flips
     matched_manually so the next sync won't overwrite ANY link. Passing ''
     clears just that field; matched_manually stays true only while at least
     one link remains. The caller passes the current `ev` row (from render)
     so the flag is derived from fresh values — no stale closure. On a failed
     write we resync to undo the optimistic change. */
  const assignMatch = useCallback(async (ev, field, value) => {
    const next = value || null
    const updated = { ...ev, [field]: next }
    const stillManual = MATCH_FIELDS.some((f) => !!updated[f])
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((row) => (row.id === ev.id
      ? { ...row, [field]: next, matched_manually: stillManual }
      : row)))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ [field]: next, matched_manually: stillManual })
      .eq('id', ev.id)
    if (e) { showError(i18n.t('components:errors.eventAssign')); qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  const assignClient = useCallback((ev, clientId) => assignMatch(ev, 'client_id', clientId), [assignMatch])
  const assignProject = useCallback((ev, projectId) => assignMatch(ev, 'project_id', projectId), [assignMatch])
  const assignLead = useCallback((ev, leadId) => assignMatch(ev, 'lead_id', leadId), [assignMatch])
  const assignGroup = useCallback((ev, groupId) => assignMatch(ev, 'group_id', groupId), [assignMatch])

  /* OWN + hide a synced event from the app view (soft-delete). Used to
     resolve a calendar duplicate when the user keeps the app meeting.
     owned=true makes the hide survive future syncs — same as deleteEvent
     below; without it the Edge Function's upsert resets deleted_at to null
     and the duplicate comes back on every auto-sync. Google is never
     touched (one-way sync), so the event still lives in the user's Google
     Calendar. Optimistic; resync on failure. */
  const dismissEvent = useCallback(async (ev) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((row) => row.id !== ev.id))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ owned: true, deleted_at: new Date().toISOString() })
      .eq('id', ev.id)
    if (e) { showError(i18n.t('components:errors.eventHide')); qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  /* OWN + edit a synced event: setting owned=true detaches it from the
     one-way sync (the Edge Function skips owned rows — migration 0023), so
     the new title/time stick instead of being overwritten on the next sync.
     `patch` carries the editable fields (title / start_time / end_time). */
  const updateEvent = useCallback(async (ev, patch) => {
    const next = { ...patch, owned: true }
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((row) => (row.id === ev.id ? { ...row, ...next } : row)))
    const { error: e } = await supabase
      .from('calendar_events')
      .update(next)
      .eq('id', ev.id)
    if (e) { showError(i18n.t('components:errors.eventUpdate')); qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  /* OWN + delete a synced event for good. owned=true makes the soft-delete
     survive future syncs (without it, the sync resets deleted_at to null and
     the event reappears). Optimistic; resync on failure. */
  const deleteEvent = useCallback(async (ev) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((row) => row.id !== ev.id))
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ owned: true, deleted_at: new Date().toISOString() })
      .eq('id', ev.id)
    if (e) { showError(i18n.t('components:errors.eventDelete')); qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  /* Un-hide a previously dismissed/deleted synced event (undo + Trash
     restore). Clears deleted_at but KEEPS owned=true, so the event stays
     visible and detached from the one-way sync — a restored event is never
     re-clobbered nor re-auto-hidden (auto-resolve skips owned rows).
     Optimistic; reconcile on failure. */
  const restoreEvent = useCallback(async (ev) => {
    qc.setQueryData(KEY, (prev) => [{ ...ev, owned: true, deleted_at: null }, ...(prev ?? []).filter((row) => row.id !== ev.id)])
    const { error: e } = await supabase
      .from('calendar_events')
      .update({ owned: true, deleted_at: null })
      .eq('id', ev.id)
    if (e) { showError(i18n.t('components:errors.eventRestore')); qc.invalidateQueries({ queryKey: KEY }) }
  }, [qc])

  return { events, loading: isLoading, error: error?.message ?? null, refetch, assignClient, assignProject, assignLead, assignGroup, dismissEvent, updateEvent, deleteEvent, restoreEvent }
}
