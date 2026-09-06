import { useCallback, useMemo } from 'react'
import { useUserPreferences } from './useUserPreferences'

/* ════════════════════════════════════════════════════════════════
   useTours — guided-tour progress over user_preferences.
   ════════════════════════════════════════════════════════════════
   Source of truth: prefs.tours, a map of screenKey → entry. An entry is
   `true` once the screen's tour is retired (every step shown, or the
   user skipped it) and `{ shown: [target…] }` while some steps are still
   owed — see lib/tourProgress.js for the rules. `tours` deep-merges in
   UserPreferencesProvider, so writing one screen's entry doesn't clobber
   the others; the `shown` array itself is replaced wholesale, which is
   why callers always hand in the full next entry rather than a delta.
   ════════════════════════════════════════════════════════════════ */

export function useTours() {
  const { prefs, update } = useUserPreferences()
  const entries = useMemo(() => prefs?.tours || {}, [prefs?.tours])

  const entryFor = useCallback((key) => entries[key], [entries])

  /* A retired screen is final: nothing may reopen it. */
  const setEntry = useCallback(
    (key, entry) => {
      if (!key || entries[key] === true) return
      update({ tours: { [key]: entry } })
    },
    [entries, update],
  )

  const markSeen = useCallback((key) => setEntry(key, true), [setEntry])

  return { entryFor, setEntry, markSeen }
}
