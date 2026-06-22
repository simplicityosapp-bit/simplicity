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
        try { await materialize(b) } catch { /* surfaced by the hook; retry next load */ }
      }
    })()
  }, [bookings, loading, materialize])
}
