import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { queryClient } from '../lib/queryClient'
import { recordAppSession } from '../lib/api/appSession'
import { AuthContext } from './AuthContext'

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    let active = true
    let prevUserId = null
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      prevUserId = data.session?.user?.id ?? null
      setSession(data.session)
      setLoading(false)
      // Record one app-usage session per tab for the admin analytics heartbeat
      // (deduped in recordAppSession). Covers tabs opened with a live session.
      if (prevUserId) recordAppSession(prevUserId)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // A password-reset link establishes a session AND fires PASSWORD_RECOVERY.
      // Flag it so Root routes to the set-new-password screen regardless of which
      // path the link landed on — robust even if the redirect URL isn't in
      // Supabase's allowlist (which would otherwise drop the user on '/').
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
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
      // A fresh sign-in in this tab — record the usage session (deduped, so a
      // token refresh for the same user won't double-count).
      if (event === 'SIGNED_IN' && nextUserId) recordAppSession(nextUserId)
      setSession(s)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const clearRecovery = useCallback(() => setRecovery(false), [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovery,
      clearRecovery,
      signOut: () => supabase.auth.signOut(),
    }),
    [session, loading, recovery, clearRecovery],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
