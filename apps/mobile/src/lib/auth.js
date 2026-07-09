import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { resetPreferenceEffects } from './preferences'

// Single source of truth for the signed-in session. Any screen reads it via
// useAuth() (replacing the earlier prop-drilling from App). Subscribes once.
const AuthContext = createContext({ session: null, ready: false })

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null)
      // Clear the previous user's global format/gender singletons on sign-out.
      if (event === 'SIGNED_OUT') resetPreferenceEffects()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, ready }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
