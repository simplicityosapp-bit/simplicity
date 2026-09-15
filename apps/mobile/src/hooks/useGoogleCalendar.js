import { useEffect, useRef, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../lib/auth'
import {
  SYNC_INTERVAL_MS, subscribeCalendar, getCalendarState, ensureCalendarStatus, syncCalendar, isSyncStale,
} from '../lib/googleCalendar'

const EMPTY = { status: null, loading: true, loaded: false, busy: false, error: null }
const BACKGROUND = new Set(['background', 'inactive'])

/* The Google Calendar status for the signed-in user (see lib/googleCalendar). */
export function useGoogleCalendar() {
  const uid = useAuth()?.session?.user?.id || null
  const s = useSyncExternalStore(subscribeCalendar, getCalendarState, getCalendarState)
  useEffect(() => { ensureCalendarStatus(uid) }, [uid])
  return s.userId === uid ? s : EMPTY
}

/* Background sync while the host screen (the calendar) is mounted — port of
   web's useGoogleCalendarAutoSync, with AppState standing in for the tab's
   visibility:
     • once on entry, if the last sync is older than the interval;
     • every SYNC_INTERVAL_MS while the app is in the foreground;
     • on return to the foreground, if stale.
   Silent (the manual button on Connections is the loud one), never overlaps
   itself, and a no-op when nothing is connected. `failing` lets the screen
   say that the feed has stopped instead of just going quiet; it tracks the
   last attempt, so a blip clears itself on the next good sync. */
export function useGoogleCalendarAutoSync({ onSynced } = {}) {
  const { status, error } = useGoogleCalendar()
  const connected = !!status?.connected

  const onSyncedRef = useRef(onSynced)
  useEffect(() => { onSyncedRef.current = onSynced }, [onSynced])
  const lastSyncedRef = useRef(status?.last_synced_at)
  useEffect(() => { lastSyncedRef.current = status?.last_synced_at }, [status?.last_synced_at])

  useEffect(() => {
    if (!connected) return undefined
    let cancelled = false
    let running = false
    let lastRun = 0

    const doSync = async () => {
      // currentState can be 'unknown' before the first change event; only a
      // KNOWN background state holds the sync back.
      if (running || cancelled || BACKGROUND.has(AppState.currentState)) return
      running = true
      lastRun = Date.now()
      try {
        await syncCalendar()
        if (!cancelled) onSyncedRef.current?.()
      } catch {
        /* Surfaced through `failing` and on the Connections card. */
      } finally {
        running = false
      }
    }

    if (isSyncStale(lastSyncedRef.current)) doSync()
    else lastRun = new Date(lastSyncedRef.current).getTime()

    const id = setInterval(doSync, SYNC_INTERVAL_MS)
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastRun >= SYNC_INTERVAL_MS) doSync()
    })
    return () => {
      cancelled = true
      clearInterval(id)
      sub?.remove?.()
    }
  }, [connected])

  // Only a connected account can be failing; a status-call error for someone
  // who never linked Google is not "your calendar stopped updating".
  return { connected, failing: connected && !!error }
}
