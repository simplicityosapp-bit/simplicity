import { useEffect, useState } from 'react'
import { upsertMoonSnapshot, listMoonSnapshots } from '../lib/moonSnapshots'

/* The last 30 recorded daily scores, for the Moon trend (empty until loaded). */
export function useMoonSnapshots(days = 30) {
  const [snapshots, setSnapshots] = useState([])
  useEffect(() => {
    let alive = true
    listMoonSnapshots(days).then((rows) => { if (alive) setSnapshots(rows) }).catch(() => { /* the live trend stands alone */ })
    return () => { alive = false }
  }, [days])
  return snapshots
}

/* Record today's score (web MoonWidget / moon-glance). Only once every feed
   behind the score has settled — a score computed from a half-loaded read is
   not a wrong pixel, it is written into permanent history — and only when one
   of the three numbers changed, not whenever a refetch rebuilt the object. */
export function useRecordMoonSnapshot(overall, ready) {
  const { pure, paced, confidence } = overall || {}
  useEffect(() => {
    if (!ready || confidence == null || pure == null) return
    upsertMoonSnapshot({ score: pure, paced, confidence }).catch(() => { /* non-fatal */ })
  }, [pure, paced, confidence, ready])
}
