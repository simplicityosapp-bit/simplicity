import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

/* ════════════════════════════════════════════════════════════════
   useAdmin — thin client over the `admin` edge function.
   ════════════════════════════════════════════════════════════════
   Every call hits one server-side function that re-verifies the caller
   is the owner (RLS can't see other users from the browser, so this is
   the ONLY way the console gets cross-user data). We never query tables
   directly here.

   - callAdmin(action, params) → resolves the function's JSON `data`,
     or throws on a non-2xx / { error } payload.
   - useAdminQuery(action, params) → fetch-on-mount with loading/error,
     plus a refetch(). `params` is shallow-compared via JSON so a fresh
     object literal each render doesn't loop.
   ════════════════════════════════════════════════════════════════ */

export async function callAdmin(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('admin', {
    body: { action, ...params },
  })
  if (error) throw error
  if (data && data.error) throw new Error(data.error)
  return data
}

export function useAdminQuery(action, params = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const key = JSON.stringify(params)
  // Guard against setting state after unmount / out-of-order responses.
  const reqId = useRef(0)

  const run = useCallback(async () => {
    const myId = ++reqId.current
    setLoading(true)
    setError(null)
    try {
      const res = await callAdmin(action, JSON.parse(key))
      if (myId === reqId.current) setData(res)
    } catch (e) {
      if (myId === reqId.current) setError(e)
    } finally {
      if (myId === reqId.current) setLoading(false)
    }
  }, [action, key])

  useEffect(() => { run() }, [run])

  return { data, loading, error, refetch: run }
}
