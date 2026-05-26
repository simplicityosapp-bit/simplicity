import { useCallback, useEffect, useRef, useState } from 'react'
import { getUserPreferences, updateUserPreferences, seedUserPreferences } from '../lib/api/userPreferences'
import { defaultPreferences, migratePreferences } from '../lib/preferences'
import { UserPreferencesContext } from '../hooks/useUserPreferences'

/* deep-merge shallow patches (one level of objects). */
function deepMerge(base, patch) {
  const out = { ...base }
  Object.keys(patch || {}).forEach((k) => {
    const v = patch[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v)
    } else {
      out[k] = v
    }
  })
  return out
}

export default function UserPreferencesProvider({ children }) {
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const prefsRef = useRef(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const raw = await getUserPreferences()
        const migrated = migratePreferences(raw || defaultPreferences())
        if (!active) return
        prefsRef.current = migrated
        setPrefs(migrated)
        if (!raw) {
          seedUserPreferences(migrated).catch(() => { /* non-fatal */ })
        }
      } catch (e) {
        if (active) setError(e.message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const update = useCallback(async (patch) => {
    const cur = prefsRef.current || defaultPreferences()
    const next = typeof patch === 'function' ? patch(cur) : deepMerge(cur, patch)
    prefsRef.current = next
    setPrefs(next)
    try {
      await updateUserPreferences(next)
    } catch (e) {
      setError(e.message)
      try {
        const raw = await getUserPreferences()
        const migrated = migratePreferences(raw || defaultPreferences())
        prefsRef.current = migrated
        setPrefs(migrated)
      } catch { /* ignore */ }
    }
  }, [])

  return (
    <UserPreferencesContext.Provider value={{ prefs, loading, error, update }}>
      {children}
    </UserPreferencesContext.Provider>
  )
}
