import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { queryClient } from '../lib/queryClient'
import { AuthContext } from './AuthContext'

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let prevUserId = null
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      prevUserId = data.session?.user?.id ?? null
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Drop all cached user data whenever the signed-in identity changes —
      // sign-out, OR a different account taking over the same tab (a future
      // account-switch affordance, a programmatic setSession, or a refresh that
      // resolves a different user) — so user B can never briefly render user A's
      // cached rows. Keyed on user.id, not the event, since a token refresh for
      // the SAME user must NOT wipe the cache. (gcTime is 5m, so this matters.)
      const nextUserId = s?.user?.id ?? null
      if (nextUserId !== prevUserId) {
        queryClient.clear()
        prevUserId = nextUserId
      }
      setSession(s)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut: () => supabase.auth.signOut(),
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
