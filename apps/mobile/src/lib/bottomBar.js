import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/* How much room the tab bar takes, measured rather than assumed.
   ────────────────────────────────────────────────────────────────
   The bar is an App-level overlay, so it sits ON TOP of every screen's
   scroll content instead of taking space from it — which means each screen
   has to reserve the room itself. Eighteen of them did that with a hardcoded
   `paddingBottom: 96`, and 96 is only right on a device with no gesture area
   at the bottom.

   The bar's own height is `10 + item + 10 + insets.bottom`, so the number the
   screens needed was never a constant:

     phone with no inset          74  → 96 was correct
     Android gesture navigation   ~97 → 1pt of the last row hidden
     iPhone with a home indicator 107 → 11pt hidden
     Android 3-button navigation  121 → 25pt hidden

   A second constant would have drifted the same way the first did — off by
   whatever the next padding change or font scale does — so the bar reports
   what it actually laid out and the screens read that. `onLayout` lands a
   frame after mount; until then FALLBACK_H reproduces exactly the old 96, so
   the first frame is unchanged rather than briefly wrong. */

// paddingTop 10 + a ~54pt item + paddingBottom 10, before any safe-area inset.
// The pre-layout guess only; the real number arrives from onLayout.
const FALLBACK_H = 74
// Breathing room between the last row of content and the top of the bar.
// 74 + 22 = 96, so nothing moves on a device where the old value was right.
const CLEARANCE = 22

const Ctx = createContext({ height: FALLBACK_H, report: () => {} })

export function BottomBarProvider({ children }) {
  const [height, setHeight] = useState(FALLBACK_H)
  /* onLayout fires on every layout pass, and a screen's padding depends on
     this — so swallow the no-op updates rather than re-render eighteen
     scroll views for a number that did not change. */
  const report = useCallback((h) => {
    const next = Math.round(h)
    if (next > 0) setHeight((cur) => (cur === next ? cur : next))
  }, [])
  const value = useMemo(() => ({ height, report }), [height, report])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** For the bar itself: hand back what it just laid out. */
export function useReportBottomBar() {
  return useContext(Ctx).report
}

/** For a screen's scroll content: the bottom padding that clears the bar. */
export function useBottomPad() {
  const { height } = useContext(Ctx)
  return useMemo(() => ({ paddingBottom: height + CLEARANCE }), [height])
}
