import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/* "Did anything on this screen fail to load?"
   ────────────────────────────────────────────────────────────────
   Screens built from many independent queries have no single `error` to read.
   Home is the extreme case: seven widgets pulling from ~28 hooks. Threading an
   error out of each one would mean touching every widget and every hook, and
   would still miss the next hook someone adds.

   So this asks React Query directly. A failed query is a failed query whoever
   started it, which is exactly the granularity the user experiences: they do
   not care WHICH fetch broke, they care that the screen is lying to them about
   being empty.

   Only queries with observers count. A cached query nobody is rendering can sit
   in the cache in an error state indefinitely; complaining about it would put a
   banner on a screen where nothing is actually missing. */
export function useDataLoadError() {
  const qc = useQueryClient()
  const [failed, setFailed] = useState(0)

  useEffect(() => {
    const cache = qc.getQueryCache()
    const count = () => cache.getAll()
      .filter((q) => q.state.status === 'error' && q.getObserversCount() > 0).length
    // React bails out when the value is unchanged, so subscribing to every
    // cache event is cheap: a re-render only happens when the count moves.
    const read = () => setFailed(count())
    read()
    return cache.subscribe(read)
  }, [qc])

  /* Retry only what actually failed. Refetching everything would also re-run
     every healthy query on the screen, which on Home is dozens of round trips
     to fix one. */
  const retry = useCallback(() => {
    qc.refetchQueries({ predicate: (q) => q.state.status === 'error' })
  }, [qc])

  return { failed, retry }
}
