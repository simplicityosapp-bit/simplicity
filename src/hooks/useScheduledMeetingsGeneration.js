import { useEffect } from 'react'
import { generateScheduledMeetings } from '../lib/scheduledMeetings'

/* MODULE-LEVEL latch shared across EVERY mount of this hook. The engine
   mounts on BOTH the home screen (AttentionWidget) and the calendar, and a
   per-mount ref only guarded one of them — so navigating home→calendar could
   run two generation passes against the same (not-yet-refetched) meetings
   snapshot and fire duplicate INSERTs. The DB's partial-unique index on
   (user, subject, scheduled_at) WHERE pending already REJECTS true duplicates,
   so this is purely an efficiency/noise guard: whichever mount wins
   materialises the rows; the other simply finds nothing 'due' on its next
   data-change re-run. */
let generatingGlobal = false

/* Mounts in the home screen + calendar — once clients, groups, and meetings
   are all loaded, walks the recurring_day/recurring_time on each subject and
   fires inserts for any missing scheduled_meeting rows in the window.
   Idempotent.

   IMPORTANT: gating on `meetingsLoading` is what keeps the engine
   from firing during the initial fetch — without it, the empty
   default state ([]) looks like "no meetings exist yet" and the
   engine cheerfully creates duplicates for every slot. */
export function useScheduledMeetingsGeneration({ clients, groups, meetings, meetingsLoading, addMeeting }) {
  useEffect(() => {
    if (generatingGlobal) return
    if (meetingsLoading) return
    if (!clients || !groups || !meetings) return
    if (!clients.length && !groups.length) return
    const due = generateScheduledMeetings(clients, groups, meetings, new Date())
    if (!due.length) return
    generatingGlobal = true
    ;(async () => {
      try {
        for (const payload of due) {
          try { await addMeeting(payload) } catch { /* non-fatal */ }
        }
      } finally {
        generatingGlobal = false
      }
    })()
  }, [clients, groups, meetings, meetingsLoading, addMeeting])
}
