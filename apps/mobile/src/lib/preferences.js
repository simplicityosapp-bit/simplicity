import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

// App-wide user preferences (one row per user, a JSONB `preferences` blob —
// mirrors the web userPreferences API). A single provider loads once and shares
// { prefs, update } so every screen reads the same reactive state (background
// mode, language, sort/scope, etc.). update() is optimistic + persists.
const PreferencesContext = createContext({ prefs: {}, update: async () => {} })

export function PreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState({})
  const ref = useRef({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase.from('user_preferences').select('preferences').eq('user_id', session.user.id).maybeSingle()
        const p = (data && data.preferences) || {}
        ref.current = p
        if (alive) setPrefs(p)
      } catch { /* keep defaults */ }
    })()
    return () => { alive = false }
  }, [])

  const update = useCallback(async (patch) => {
    const next = { ...ref.current, ...patch }
    ref.current = next
    setPrefs(next)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('user_preferences').update({ preferences: next }).eq('user_id', session.user.id).select('preferences').maybeSingle()
      if (!data) await supabase.from('user_preferences').insert({ user_id: session.user.id, preferences: next })
    } catch { /* keep optimistic */ }
  }, [])

  return <PreferencesContext.Provider value={{ prefs, update }}>{children}</PreferencesContext.Provider>
}

export const usePreferences = () => useContext(PreferencesContext)
