import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listCommunityEvents, createCommunityEvent, deleteCommunityEvent,
  addEventToMyCalendar, removeEventFromMyCalendar, listMyAddedEventIds,
  getGoogleCalendarStatus, importCommunityEventsToGoogle,
} from '../lib/api/communityEvents'

/* ════════════════════════════════════════════════════════════════
   useCommunityEvents — the community calendar's data + writers
   ════════════════════════════════════════════════════════════════
   Two queries: the events themselves, and which of them THIS member has added
   to their own in-app calendar (a Set of ids driving the add/added toggle).
   Writers patch both caches optimistically-ish (create/remove seed the list;
   add/remove toggle the added set), matching the repo's plain-writer style.
   ════════════════════════════════════════════════════════════════ */
const KEY = ['communityEvents']
const ADDED_KEY = ['communityEventsAdded']

const byStart = (a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0)

export function useCommunityEvents({ enabled = true } = {}) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: KEY, queryFn: listCommunityEvents, enabled })
  const addedQ = useQuery({ queryKey: ADDED_KEY, queryFn: listMyAddedEventIds, enabled })
  const statusQ = useQuery({ queryKey: ['googleCalendarStatus'], queryFn: getGoogleCalendarStatus, enabled, staleTime: 60_000 })
  const events = data ?? []
  const addedIds = new Set(addedQ.data ?? [])
  const googleConnected = !!statusQ.data?.connected

  const create = useCallback(async (payload) => {
    const row = await createCommunityEvent(payload)
    qc.setQueryData(KEY, (prev) => [...(prev ?? []), row].sort(byStart))
    return row
  }, [qc])

  const remove = useCallback(async (id) => {
    await deleteCommunityEvent(id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((e) => e.id !== id))
  }, [qc])

  const addToCalendar = useCallback(async (event) => {
    await addEventToMyCalendar(event)
    qc.setQueryData(ADDED_KEY, (prev) => ((prev ?? []).includes(event.id) ? prev : [...(prev ?? []), event.id]))
  }, [qc])

  const removeFromCalendar = useCallback(async (eventId) => {
    await removeEventFromMyCalendar(eventId)
    qc.setQueryData(ADDED_KEY, (prev) => (prev ?? []).filter((x) => x !== eventId))
  }, [qc])

  /* Push added events to Google (manual). The edge retags the calendar_events
     rows (community: → cmt<hex>), so refetch the added set to stay in sync. */
  const importToGoogle = useCallback(async (evts) => {
    const result = await importCommunityEventsToGoogle(evts)
    qc.invalidateQueries({ queryKey: ADDED_KEY })
    return result
  }, [qc])

  return {
    events,
    addedIds,
    googleConnected,
    loading: isLoading,
    error: error?.message ?? null,
    create,
    remove,
    addToCalendar,
    removeFromCalendar,
    importToGoogle,
  }
}
