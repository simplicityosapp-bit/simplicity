import { useCallback } from 'react'
import { useUserPreferences } from './useUserPreferences'

/* ════════════════════════════════════════════════════════════════
   useCoachmarks — first-touch guidance state over user_preferences.
   ════════════════════════════════════════════════════════════════
   Source of truth: prefs.coachmarks (a flat map id → true). A button
   is "virgin" while its id is absent. dismiss(id) marks it seen, which
   removes its glow for good. `coachmarks` is registered as a DEEP_KEY
   in UserPreferencesProvider, so dismissing one id merges in without
   clobbering the others.
   ════════════════════════════════════════════════════════════════ */

export function useCoachmarks() {
  const { prefs, update } = useUserPreferences()
  const seen = prefs?.coachmarks || {}

  const isVirgin = useCallback((id) => !seen[id], [seen])

  const dismiss = useCallback(
    (id) => {
      if (!id || seen[id]) return
      update({ coachmarks: { [id]: true } })
    },
    [seen, update],
  )

  return { isVirgin, dismiss }
}
