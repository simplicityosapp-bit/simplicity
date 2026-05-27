import { useEffect, useRef } from 'react'
import { generateScheduledMeetings } from '../lib/scheduledMeetings'

/* Mounts in the home screen — once clients, groups, and meetings are
   all loaded, walks the recurring_day/recurring_time on each subject
   and fires inserts for any missing scheduled_meeting rows in the
   window. Idempotent; the same ref-latch pattern as
   useRecurringGeneration keeps the in-flight inserts from re-firing
   through the meetings state update. */
export function useScheduledMeetingsGeneration({ clients, groups, meetings, addMeeting }) {
  const generating = useRef(false)

  useEffect(() => {
    if (generating.current) return
    if (!clients || !groups || !meetings) return
    if (!clients.length && !groups.length) return
    const due = generateScheduledMeetings(clients, groups, meetings, new Date())
    if (!due.length) return
    generating.current = true
    ;(async () => {
      for (const payload of due) {
        try { await addMeeting(payload) } catch { /* non-fatal */ }
      }
      generating.current = false
    })()
  }, [clients, groups, meetings, addMeeting])
}
