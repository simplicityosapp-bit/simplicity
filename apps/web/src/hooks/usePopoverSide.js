import { useCallback, useLayoutEffect, useState } from 'react'

/* Global rule: a popover/menu opens TOWARD the centre of the screen and never
   spills off an edge. CSS alone cannot decide either half — it does not know
   where the anchor sits in the viewport, and it does not know how much room is
   left beside it.

   Pass the anchor element ref + whether the popover is open. Returns a style to
   spread onto the popover (which is position:absolute inside a position:relative
   anchor):

     const { style } = usePopoverSide(ref, open)
     <Box className="…-pop" style={style}>

   `style` pins the popover to the physical side that opens it inward:
     - anchor on the right half → right:0 → opens leftward  (toward the centre)
     - anchor on the left half  → left:0  → opens rightward (toward the centre)

   …and caps `maxWidth` at the room that actually exists on that side, less a
   gutter, so a popover wider than the gap cannot reach the edge. Picking a side
   was never enough on its own: a 280px menu hung off an anchor 200px from the
   edge still lands 80px past it, which is what a phone kept showing (beta
   07/09). `side` and `maxWidth` are returned alongside for callers that need
   them separately.

   Recomputed on open and on resize — a phone turned sideways changes both
   answers, and this rule was reported on phones.

   FLOOR: the cap never goes below 180px. Below that a menu is unreadable, and a
   popover pinned to a very narrow gap is better fixed by moving the anchor than
   by squeezing the menu into a column of single characters. */
const GUTTER = 12
const MIN_WIDTH = 180

export function usePopoverSide(anchorRef, open) {
  const [placement, setPlacement] = useState({ side: 'right', maxWidth: null })

  const measure = useCallback(() => {
    const el = anchorRef?.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const side = (r.left + r.right) / 2 > vw / 2 ? 'right' : 'left'
    /* Pinned right:0 the popover grows leftward, so the room is everything from
       the anchor's right edge to the left edge of the screen — and the mirror
       image when it is pinned left. */
    const room = side === 'right' ? r.right : vw - r.left
    setPlacement({ side, maxWidth: Math.max(MIN_WIDTH, Math.round(room - GUTTER)) })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) return undefined
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, measure])

  const { side, maxWidth } = placement
  return {
    side,
    maxWidth,
    style: { [side]: 0, ...(maxWidth ? { maxWidth } : null) },
  }
}
