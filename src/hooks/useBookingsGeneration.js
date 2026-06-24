import { useEffect, useRef } from 'react'

/* Materialise auto-confirmed bookings: a page with auto_confirm=true produces
   bookings that arrive already 'confirmed' but with no lead / calendar_event
   (the public edge function only inserts the booking row). This hook — mounted
   where it always runs (home) — backfills the lead + owned event for each such
   row exactly once. Manual approvals go through confirm() instead and never
   reach here. Idempotent: an in-flight ref + the lead/event guard in
   materializeBooking prevent double-creation under StrictMode. */
export function useBookingsGeneration({ bookings, loading, materialize }) {
  const inFlight = useRef(new Set())

  useEffect(() => {
    if (loading || !Array.isArray(bookings)) return
    const pending = bookings.filter(
      (b) => b.status === 'confirmed' && !b.event_id && !inFlight.current.has(b.id),
    )
    if (!pending.length) return
    ;(async () => {
      for (const b of pending) {
        inFlight.current.add(b.id)
        /* On failure, drop the id so the next bookings change retries it
           (materializeBooking is idempotent — it early-returns once the
           lead + event exist). Otherwise a transient failure would strand the
           booking until a full remount. */
        try { await materialize(b) } catch { inFlight.current.delete(b.id) }
      }
    })()
  }, [bookings, loading, materialize])
}
