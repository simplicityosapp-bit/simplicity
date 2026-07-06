import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// User preferences — one row per user holding all settings in a JSONB blob
// (`preferences`), mirroring the web userPreferences API. Reads once on mount
// and exposes an optimistic `update(patch)` that merges + persists (insert on
// first write). Degrades to in-memory only if offline / no session.
export function usePreferences() {
  const [prefs, setPrefs] = useState(null)
  const ref = useRef({})

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { if (alive) setPrefs({}); return }
        const { data } = await supabase.from('user_preferences').select('preferences').eq('user_id', session.user.id).maybeSingle()
        const p = (data && data.preferences) || {}
        ref.current = p
        if (alive) setPrefs(p)
      } catch {
        if (alive) setPrefs({})
      }
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
    } catch {
      /* keep the optimistic value; a later successful update will reconcile */
    }
  }, [])

  return { prefs: prefs || {}, update }
}
