import { useCallback, useEffect, useState } from 'react'
import { getMoonSnapshotLastDays } from '../lib/api/moonSnapshots'

/* Loads the last `days` daily moon-glance snapshots from Supabase.
   Returns `snapshots` as an ascending-by-date array (oldest first).
   The MoonGlance trend chart prefers these over the live recompute
   once there are enough to draw a line; for fresh users it stays
   empty and the screen falls back to the live trend. */
export function useMoonSnapshots(days = 30) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshots(await getMoonSnapshotLastDays(days))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const data = await getMoonSnapshotLastDays(days)
        if (active) { setSnapshots(data); setError(null) }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [days])

  return { snapshots, loading, error, refetch }
}
