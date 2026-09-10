import { useCallback, useEffect, useRef, useState } from 'react'
import { isAdminUser } from '@simplicity/core'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/* ════════════════════════════════════════════════════════════════
   useAdmin — thin client over the `admin` edge function.
   ════════════════════════════════════════════════════════════════
   Every console read and write goes through ONE server-side function
   that re-verifies the caller is an admin. That is not a convenience:
   RLS scopes every table to the signed-in user, so a client simply
   cannot see another user's rows. The edge function, holding the
   service_role key, is the only way cross-user data reaches a console
   at all — which is why nothing here ever touches a table directly.

   Web wraps the same function in React Query. This app has no query
   cache, so this is the app's ordinary hook shape — fetch on mount,
   expose loading/error, hand back a refetch — with two details that
   matter more here than elsewhere:

   - A non-admin must never sit on a spinner. `enabled` is false for
     them, and `loading` reports false rather than "pending forever",
     so the screen can say "nothing here" instead of pretending to
     load something it will never be given.
   - A response that lands after unmount, or after a newer request
     started, is dropped. Console reads take ~0.6-1.6s and the tabs
     are one tap apart, so out-of-order replies are ordinary, not
     exotic.
   ════════════════════════════════════════════════════════════════ */

export async function callAdmin(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('admin', {
    body: { action, ...params },
  })
  if (error) throw error
  /* The function reports its own failures in a 200 body as often as by
     status, so an { error } payload has to be thrown like a transport
     error or the screen renders an empty console as if it were real. */
  if (data && data.error) throw new Error(data.error)
  return data
}

export function useAdminQuery(action, params = {}) {
  const { session } = useAuth()
  const allowed = isAdminUser(session?.user)

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(allowed)

  /* Serialised so a fresh object literal each render does not re-fire the
     effect forever — `{ range }` is a new object every time Analytics
     re-renders, and comparing it by reference never settles. */
  const key = JSON.stringify(params ?? {})
  const reqId = useRef(0)

  const run = useCallback(async () => {
    if (!allowed) { setData(null); setLoading(false); return }
    const mine = ++reqId.current
    setLoading(true)
    try {
      const res = await callAdmin(action, JSON.parse(key))
      if (mine !== reqId.current) return // a newer request already went out
      setData(res ?? null)
      setError(null)
    } catch (e) {
      if (mine !== reqId.current) return
      setError(e)
      /* Deliberately keeping the last good payload: a failed refresh on a
         console you are reading should not blank the screen you were
         reading. The error banner says the figures may be stale. */
    } finally {
      if (mine === reqId.current) setLoading(false)
    }
  }, [action, key, allowed])

  useEffect(() => {
    run()
    return () => { reqId.current += 1 } // in-flight replies are now stale
  }, [run])

  return { data, loading, error, refetch: run }
}
