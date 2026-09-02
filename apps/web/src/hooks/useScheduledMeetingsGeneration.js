import { useEffect } from 'react'
import { generateScheduledMeetings } from '../lib/scheduledMeetings'
import i18n from '@simplicity/core/i18n'
import { showToast } from '../lib/toast'

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
export function useScheduledMeetingsGeneration({ clients, groups, members, meetings, loading, addMeeting }) {
  useEffect(() => {
    if (generatingGlobal) return
    /* ONE loading gate covering every input, not just the meetings.
       All four hooks return `data ?? []`, so "still fetching" and "genuinely
       empty" look identical from here — and an empty MEMBERS or GROUPS array
       is not harmless: effectiveClientMeta finds no membership, falls back to
       the stale status_meta column, and materialises a weekly meeting for a
       client whose groups have all ended. That is the bug fixed in 5a2ce95,
       reachable again as a race for as long as the fetches are in flight. */
    if (loading) return
    if (!clients || !groups || !members || !meetings) return
    if (!clients.length && !groups.length) return
    const due = generateScheduledMeetings(clients, groups, meetings, new Date(), { members })
    if (!due.length) return
    generatingGlobal = true
    ;(async () => {
      let failed = 0
      try {
        for (const payload of due) {
          try { await addMeeting(payload) } catch { failed += 1 }
        }
        /* One message for the pass, not one per row. This engine's browser copy
           only looks back 14 days, so unlike the recurring one it cannot always
           recover on its own — the nightly scheduled-meetings-cron is what
           closes that gap. All the more reason to say something now rather than
           rely on a job the user cannot see. */
        if (failed) showToast(i18n.t('components:generateFailed.meetings'), 'error')
      } finally {
        generatingGlobal = false
      }
    })()
  }, [clients, groups, members, meetings, loading, addMeeting])
}
