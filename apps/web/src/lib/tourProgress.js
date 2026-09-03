/* ════════════════════════════════════════════════════════════════
   Tour progress — what prefs.tours[screenKey] holds, and how it moves.
   ════════════════════════════════════════════════════════════════
   One entry per screen:
     absent               nothing shown yet
     { shown: [target…] } these steps have been acknowledged; the rest wait
     true                 every step shown, or the tour skipped — retired

   Per step rather than per screen, because a screen's tour used to be
   marked seen the moment it ended, however many steps had actually run.
   The finance and leads screens open a brand-new account in a first-run
   state that renders none of the things their tours explain — no chart,
   no breakdown, no list — so the tour ran with the one "+" step, the
   screen was retired, and the four steps that mattered never came back.
   Now a step whose target isn't on screen simply waits for a visit where
   it is. A widget the user has switched off waits the same way.

   Steps are keyed by their target selector: it is what the tour looks
   for, so it is also what "this one has been shown" has to mean. Two
   steps on one screen must not share a selector.
   ════════════════════════════════════════════════════════════════ */

/* The steps of `def` that still have to be shown, given the stored entry. */
export function pendingSteps(def, entry) {
  if (!def || entry === true) return []
  const shown = new Set(entry?.shown || [])
  return def.filter((s) => !shown.has(s.target))
}

/* The entry after `targets` have been acknowledged. Collapses to `true` on
   its own once nothing in `def` is left, so a screen whose every step has
   been seen costs no work on later visits. A retired screen stays retired. */
export function recordShown(entry, def, targets) {
  if (entry === true) return true
  const shown = new Set(entry?.shown || [])
  for (const t of targets || []) shown.add(t)
  if ((def || []).every((s) => shown.has(s.target))) return true
  return { shown: [...shown] }
}
