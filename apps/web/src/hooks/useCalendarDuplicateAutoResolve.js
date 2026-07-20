import { useEffect, useRef } from 'react'
import { isNearExactDuplicate } from '@simplicity/core'
import i18n from '@simplicity/core/i18n'
import { pushUndo } from '../lib/undo'

/* ════════════════════════════════════════════════════════════════
   AUTO-RESOLVE near-exact calendar duplicates.
   ════════════════════════════════════════════════════════════════
   When a synced Google event and an app meeting for the same subject
   start within AUTO_RESOLVE_WINDOW_MIN of each other (isNearExactDuplicate),
   hide the Google MIRROR automatically — never the app meeting, which
   carries the billing / session data. One-way sync means the event still
   lives in the user's Google Calendar, so this is fully reversible:
     • a single batched undo (the standard UndoToast), and
     • the Trash drawer (owned + deleted_at rows), permanently.

   Looser duplicates (same subject/day, but the times off by more) are left
   to the manual banner + modal, where a human confirms — a common-name
   false match is far likelier there.

   Skips owned events: an event the user kept or restored is owned=true, so
   it's never (re-)auto-hidden. `attemptedRef` adds a per-session guard so a
   transient hide failure can't spin into a retry loop.

   Mounted by the CALENDAR SCREEN ONLY — the single place Google auto-sync
   runs — so it fires once per newly-synced duplicate, not from every
   consumer of useCalendarDuplicates.
   ════════════════════════════════════════════════════════════════ */
export function useCalendarDuplicateAutoResolve({ duplicates = [], dismissEvent, restoreEvent }) {
  const busyRef = useRef(false)
  const attemptedRef = useRef(new Set())

  useEffect(() => {
    if (busyRef.current || !dismissEvent || !restoreEvent) return

    const tight = duplicates.filter(
      (d) => !d.event.owned && !attemptedRef.current.has(d.event.id) && isNearExactDuplicate(d),
    )
    if (!tight.length) return

    /* Snapshot the events NOW — `duplicates` is re-derived every render, so
       the optimistic hide below mutates the cache out from under it. */
    const events = tight.map((d) => d.event)
    events.forEach((ev) => attemptedRef.current.add(ev.id))

    busyRef.current = true
    Promise.all(events.map((ev) => dismissEvent(ev))).finally(() => { busyRef.current = false })

    /* One batched undo for the whole pass. redo re-hides; undo restores the
       mirrors (owned=true, so they won't be auto-hidden again). */
    pushUndo({
      label: i18n.t(events.length === 1 ? 'calendar:dup.autoHiddenOne' : 'calendar:dup.autoHiddenMany', { count: events.length }),
      undo: async () => { await Promise.all(events.map((ev) => restoreEvent(ev))) },
      redo: async () => { await Promise.all(events.map((ev) => dismissEvent(ev))) },
    })
  }, [duplicates, dismissEvent, restoreEvent])
}
