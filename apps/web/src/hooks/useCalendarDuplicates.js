import { useMemo, useCallback } from 'react'
import { findCalendarDuplicates } from '@simplicity/core'

/* Derives calendar duplicates (app recurring meeting ⇄ synced Google event)
   from data the CALLER already holds, plus the two resolution actions. It
   takes data as arguments on purpose: useCalendarEvents keeps local state, so
   re-fetching it here would create a second, out-of-sync copy. Each screen
   passes its own single instance.

   Resolution (never auto, never touches Google — decision 08/06/2026):
     · hideMeeting → mark the app meeting 'skipped'
     · hideEvent   → soft-delete (hide) the synced event in the app */
export function useCalendarDuplicates({ meetings, calendarEvents, clients, groups, updateMeeting, dismissEvent }) {
  const duplicates = useMemo(
    () => findCalendarDuplicates({ meetings, calendarEvents, clients, groups }),
    [meetings, calendarEvents, clients, groups],
  )

  const hideMeeting = useCallback(
    (dup) => updateMeeting?.(dup.meeting.id, { status: 'skipped' })?.catch?.(() => {}),
    [updateMeeting],
  )
  const hideEvent = useCallback((dup) => dismissEvent?.(dup.event), [dismissEvent])

  return { duplicates, hideMeeting, hideEvent }
}
