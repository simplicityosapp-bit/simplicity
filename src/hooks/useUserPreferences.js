import { createContext, useContext } from 'react'

/* ════════════════════════════════════════════════════════════════
   useUserPreferences — single source of truth for user settings.
   ════════════════════════════════════════════════════════════════
   Backed by <UserPreferencesProvider/> (see components/...). All
   consumers (settings screen, home, PrefsApplier, isr() wiring)
   share the same state via context. Without the provider this hook
   returns a harmless stub so login/auth screens don't crash.
   ════════════════════════════════════════════════════════════════ */

export const UserPreferencesContext = createContext(null)

export function useUserPreferences() {
  const ctx = useContext(UserPreferencesContext)
  if (!ctx) {
    return { prefs: null, loading: false, error: null, update: async () => {} }
  }
  return ctx
}
