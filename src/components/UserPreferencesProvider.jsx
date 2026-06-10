import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  /* Serializes DB writes so an earlier write finishing last can't overwrite a
     later merge (lost-update race when two update()s land near-simultaneously). */
  const writeChain = useRef(Promise.resolve())

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const raw = await getUserPreferences()
        const migrated = migratePreferences(raw || defaultPreferences())
        if (!active) return
        /* RACE FIX: if the user already toggled something before this
           initial load resolved, their `update()` call set prefsRef
           and pushed a write to the DB. Adopting the server value
           here would silently revert their click (the server read
           started BEFORE the user clicked). Only adopt server prefs
           when the user hasn't interacted yet. */
        if (prefsRef.current == null) {
          prefsRef.current = migrated
          setPrefs(migrated)
        }
        if (!raw) {
          seedUserPreferences(prefsRef.current || migrated).catch(() => { /* non-fatal */ })
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
    /* Chain the DB write after any in-flight one, and send the LATEST merged
       state — so concurrent updates can't lose each other. */
    const task = writeChain.current.then(async () => {
      try {
        await updateUserPreferences(prefsRef.current)
      } catch (e) {
        setError(e.message)
        try {
          const raw = await getUserPreferences()
          const migrated = migratePreferences(raw || defaultPreferences())
          prefsRef.current = migrated
          setPrefs(migrated)
        } catch { /* ignore */ }
      }
    })
    writeChain.current = task.catch(() => {})
    return task
  }, [])

  const value = useMemo(() => ({ prefs, loading, error, update }), [prefs, loading, error, update])

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  )
}
