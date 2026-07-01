import { useEffect, useRef } from 'react'
import { useGoogleCalendar } from './useGoogleCalendar'

/* Client-side auto-sync for Google Calendar — no cron, no server schedule.
   While the host screen (the calendar) is mounted and Google Calendar is
   connected, this:
     • syncs once on entry IF the last sync is older than the interval,
     • re-syncs every SYNC_INTERVAL_MS while the screen stays open,
     • re-syncs when the tab regains focus after being hidden (if stale).
   It is silent (no toast/spinner — that's reserved for the manual "סנכרן
   עכשיו" button), never overlaps a running sync, and is a no-op when Google
   Calendar isn't connected. Pass onSynced to reload the cached events
   (useCalendarEvents.refetch) after each successful pull. */
const SYNC_INTERVAL_MS = 10 * 60_000 // 10 minutes

export function useGoogleCalendarAutoSync({ onSynced } = {}) {
  const { status, sync } = useGoogleCalendar()
  const connected = !!status?.connected

  /* Mirror the latest values through refs (updated in effects, never during
     render) so the main effect can stay keyed on [connected, sync] — it
     shouldn't tear down + rebuild the interval every time a sync updates
     last_synced_at. */
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
      if (running || cancelled || document.visibilityState === 'hidden') return
      running = true
      lastRun = Date.now()
      try {
        await sync()
        if (!cancelled) onSyncedRef.current?.()
      } catch {
        /* Errors (expired/broken creds) surface on the Connections screen;
           the background sync stays quiet so it never nags. */
      } finally {
        running = false
      }
    }

    /* On entry: sync only if the last sync is stale (or never happened), so
       hopping in and out of the calendar doesn't fire redundant pulls. */
    const last = lastSyncedRef.current ? new Date(lastSyncedRef.current).getTime() : 0
    if (Date.now() - last >= SYNC_INTERVAL_MS) doSync()
    else lastRun = last

    const id = setInterval(doSync, SYNC_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun >= SYNC_INTERVAL_MS) doSync()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [connected, sync])
}
