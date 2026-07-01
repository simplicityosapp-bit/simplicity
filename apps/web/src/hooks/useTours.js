import { useCallback } from 'react'
import { useUserPreferences } from './useUserPreferences'

/* ════════════════════════════════════════════════════════════════
   useTours — guided-tour "seen" state over user_preferences.
   ════════════════════════════════════════════════════════════════
   Source of truth: prefs.tours (a flat map screenKey → true). A screen
   tour auto-runs while its key is absent. markSeen(key) records that the
   user finished or skipped it, so it won't run again. `tours` deep-merges
   in UserPreferencesProvider, so marking one screen seen doesn't clobber
   the others.
   ════════════════════════════════════════════════════════════════ */

export function useTours() {
  const { prefs, update } = useUserPreferences()
  const seen = prefs?.tours || {}

  const isSeen = useCallback((key) => !!seen[key], [seen])

  const markSeen = useCallback(
    (key) => {
      if (!key || seen[key]) return
      update({ tours: { [key]: true } })
    },
    [seen, update],
  )

  return { isSeen, markSeen }
}
